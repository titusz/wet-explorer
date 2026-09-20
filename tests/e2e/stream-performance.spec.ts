/** Measure the complete fixture's mounted list, scroll frames, and renderer memory. */

import { writeFile } from "node:fs/promises";
import {
  type BrowserContext,
  test as base,
  expect,
  type Page,
} from "@playwright/test";
import { fileRoute } from "./fixture-host.ts";
import { rendererMemory } from "./renderer-memory.ts";
import {
  type StreamingFixture,
  streamingFixture,
} from "./streaming-fixture.ts";

const test = base.extend<{ host: StreamingFixture }>({
  host: async ({ context }, use) => {
    const host = await streamingFixture(context);
    try {
      await use(host);
    } finally {
      await host.close();
    }
  },
});
test.use({
  ignoreHTTPSErrors: true,
  proxy: { server: "http://127.0.0.1:43873", bypass: "127.0.0.1" },
});

/** Collect page and worker heap/buffer usage from the Chromium debugging protocol. */
async function retainedBytes(
  context: BrowserContext,
  page: Page,
): Promise<number> {
  const browser = context.browser();
  if (!browser) throw new Error("Browser unavailable");
  const session = await browser.newBrowserCDPSession();
  const pageSession = await context.newCDPSession(page);
  try {
    await pageSession.send("HeapProfiler.collectGarbage");
    const pageMemory = await pageSession.send("Runtime.getHeapUsage");
    let total =
      pageMemory.usedSize +
      (pageMemory.embedderHeapUsedSize ?? 0) +
      (pageMemory.backingStorageSize ?? 0);
    const { targetInfos } = await session.send("Target.getTargets");
    for (const target of targetInfos.filter(
      (entry) => entry.type === "worker" && entry.url.includes("reader.worker"),
    )) {
      const { sessionId } = await session.send("Target.attachToTarget", {
        targetId: target.targetId,
      });
      const memory = await new Promise<{
        usedSize: number;
        embedderHeapUsedSize?: number;
        backingStorageSize?: number;
      }>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Worker memory measurement timed out")),
          5000,
        );
        session.on("Target.receivedMessageFromTarget", (event) => {
          if (event.sessionId !== sessionId) return;
          const message = JSON.parse(event.message);
          if (message.id === 2) {
            clearTimeout(timer);
            if (message.error) reject(new Error(message.error.message));
            else resolve(message.result);
          }
        });
        void session.send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({
            id: 1,
            method: "HeapProfiler.collectGarbage",
          }),
        });
        void session.send("Target.sendMessageToTarget", {
          sessionId,
          message: JSON.stringify({ id: 2, method: "Runtime.getHeapUsage" }),
        });
      });
      total +=
        memory.usedSize +
        (memory.embedderHeapUsedSize ?? 0) +
        (memory.backingStorageSize ?? 0);
      await session.send("Target.detachFromTarget", { sessionId });
    }
    return total;
  } finally {
    await pageSession.detach();
    await session.detach();
  }
}

test("20,000-row list stays bounded and scrolls within the frame budget", async ({
  page,
  context,
  browserName,
  host,
}, testInfo) => {
  test.setTimeout(90000);
  await page.goto(`./${fileRoute}`);
  await page.waitForFunction(
    () => document.querySelector(".status-label")?.textContent === "Paused",
  );
  const initialMemory =
    browserName === "chromium" ? await rendererMemory(context) : null;
  for (let count = 0; count < 110; count++) {
    if ((await page.locator(".status-label").textContent()) === "Complete")
      break;
    await expect(page.locator(".status-label")).toHaveText("Paused");
    const before = await page.locator(".stream-scope").textContent();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator(".stream-scope")).not.toHaveText(before ?? "");
  }
  await expect(page.locator(".status-label")).toHaveText("Complete");
  await expect(page.locator(".stream-scope")).toContainText(
    "20,000 records read",
  );
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toHaveAttribute("aria-setsize", "20000");
  expect(
    await page.getByRole("listbox").getByRole("option").count(),
  ).toBeLessThan(40);
  const loadedMemory =
    browserName === "chromium" ? await rendererMemory(context) : null;
  const timing = await page.evaluate(async () => {
    const viewport = document.querySelector<HTMLElement>(".record-viewport");
    if (!viewport) throw new Error("Missing viewport");
    const idle: number[] = [];
    let idlePrevious = 0;
    for (let step = 0; step < 60; step++) {
      const now = await new Promise<number>((resolve) =>
        requestAnimationFrame(resolve),
      );
      if (idlePrevious) idle.push(now - idlePrevious);
      idlePrevious = now;
    }
    const updates: number[] = [];
    const originals: {
      prototype: { performUpdate: (...args: unknown[]) => unknown };
      original: (...args: unknown[]) => unknown;
    }[] = [];
    for (const tag of ["record-stream", "record-row"]) {
      const prototype = customElements.get(tag)?.prototype;
      const original = prototype.performUpdate;
      originals.push({ prototype, original });
      prototype.performUpdate = function (...args: unknown[]) {
        const start = performance.now();
        const result = original.apply(this, args);
        updates.push(performance.now() - start);
        return result;
      };
    }
    const samples: number[] = [];
    let previous = 0;
    for (let step = 0; step < 120; step++) {
      const now = await new Promise<number>((resolve) =>
        requestAnimationFrame(resolve),
      );
      if (previous) samples.push(now - previous);
      previous = now;
      viewport.scrollTop =
        (step * (viewport.scrollHeight - viewport.clientHeight)) / 119;
    }
    for (const { prototype, original } of originals)
      prototype.performUpdate = original;
    return { samples, idle, maxComponentUpdateMs: Math.max(...updates) };
  });
  const durations = timing.samples;
  const memory =
    browserName === "chromium" ? await retainedBytes(context, page) : null;
  const nativeMemory =
    browserName === "chromium" ? await rendererMemory(context) : null;
  const measurements = JSON.stringify(
    {
      maxFrameMs: Math.max(...durations),
      frameDurationsMs: durations,
      idleFrameDurationsMs: timing.idle,
      maxComponentUpdateMs: timing.maxComponentUpdateMs,
      retainedHeapAndBuffersBytes: memory,
      rendererMemory: nativeMemory,
      initialRendererMemory: initialMemory,
      loadedRendererMemory: loadedMemory,
      requests: host.requests.length,
      fixtureBytesSent: host.bytesSent,
      peakRequests: host.peak,
    },
    null,
    2,
  );
  const measurementPath = testInfo.outputPath("stream-performance.json");
  await writeFile(measurementPath, measurements);
  await testInfo.attach("stream-performance.json", {
    path: measurementPath,
    contentType: "application/json",
  });
  console.log(
    `${browserName}: max frame ${Math.max(...durations).toFixed(2)} ms; retained heap and buffers ${memory === null ? "not measured" : `${(memory / 1048576).toFixed(2)} MiB`}`,
  );
  if (nativeMemory)
    console.log(
      `Renderer resident memory: initial ${((initialMemory?.residentBytes ?? 0) / 1048576).toFixed(2)} MiB; loaded ${((loadedMemory?.residentBytes ?? 0) / 1048576).toFixed(2)} MiB; after scroll/GC ${(nativeMemory.residentBytes / 1048576).toFixed(2)} MiB across ${nativeMemory.processes.length} processes`,
    );
  expect(Math.max(...durations)).toBeLessThanOrEqual(50);
  if (memory !== null) expect(memory).toBeLessThan(150 * 1024 * 1024);
  if (nativeMemory)
    expect(nativeMemory.residentBytes).toBeLessThan(150 * 1024 * 1024);
  expect(host.unexpected).toEqual([]);
  expect(host.peak).toBe(1);
});
