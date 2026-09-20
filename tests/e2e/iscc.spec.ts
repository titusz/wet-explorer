/** Exercise real wasm loading, record identity, timing, copying, and recovery offline. */
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { fileRoute, fixtureHost } from "./fixture-host.ts";
import { captureClipboard } from "./interaction.ts";

const reference =
  "ISCC:EAD7FBRUORDROH5TB3F4IYW5YFUPZR5PKR3BEIMQSGSZSY6VMJHDDVQ";
const empty = "ISCC:EADSL4F2WZY7KBXBYUZPREWZ26IXUJJOPJJAQMXVSY5IZVHJU7RRFNI";
test.use({
  trace: {
    mode: "retain-on-failure",
    screenshots: false,
    snapshots: true,
    sources: true,
  },
});

/** Build distinct small payloads whose codes are independently known by the reference tests. */
function member(text: string): Buffer {
  return gzipSync(
    Buffer.concat([
      Buffer.from(
        `WARC/1.0\r\nWARC-Type: conversion\r\nWARC-Target-URI: https://example.org/record\r\nContent-Length: ${Buffer.byteLength(text)}\r\n\r\n`,
      ),
      Buffer.from(text),
      Buffer.from("\r\n\r\n"),
    ]),
  );
}

test("wasm waits for the visible panel, computes the reference within 500 ms, and copies the full code", async ({
  page,
  context,
  browserName,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  const assets: string[] = [];
  context.on("request", (request) => {
    if (/iscc(?:\.worker|_wasm).*\.(?:js|wasm)$/.test(request.url()))
      assets.push(request.url());
  });
  await captureClipboard(page);
  await page.goto("./");
  await expect(page.locator(".landing")).toBeVisible();
  expect(assets).toEqual([]);
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Complete");
  expect(assets).toEqual([]);
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await expect(page.locator(".record-text")).toBeVisible();
  await expect(page.locator(".iscc-panel")).toHaveAttribute(
    "data-state",
    "idle",
  );
  expect(assets).toEqual([]);
  const duration = await page.locator(".iscc-panel").evaluate(
    (panel) =>
      new Promise<number>((resolve, reject) => {
        const start = performance.now();
        const timeout = setTimeout(() => {
          observer.disconnect();
          reject(new Error("ISCC did not become ready"));
        }, 5000);
        const observer = new MutationObserver(() => {
          if (panel.getAttribute("data-state") !== "ready") return;
          observer.disconnect();
          requestAnimationFrame(() =>
            setTimeout(() => {
              clearTimeout(timeout);
              resolve(performance.now() - start);
            }, 0),
          );
        });
        observer.observe(panel, {
          attributes: true,
          childList: true,
          subtree: true,
        });
        panel.scrollIntoView({ block: "center" });
      }),
  );
  console.log(`${browserName}: cold ISCC panel ${duration.toFixed(1)} ms`);
  expect(duration).toBeLessThan(500);
  await expect(page.locator(".iscc-code")).toHaveText(reference);
  expect(assets.filter((url) => url.endsWith(".wasm"))).toHaveLength(1);
  expect(assets.filter((url) => url.endsWith(".js"))).toHaveLength(1);
  const copy = page.getByRole("button", { name: "Copy ISCC Text-Code" });
  await copy.click();
  await expect(page.locator(".iscc-panel .copy-button")).toHaveText("Copied");
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedText: string }).copiedText,
    ),
  ).toBe(reference);
  await expect(
    page.getByRole("button", { name: "Copy ISCC Text-Code" }),
  ).toHaveText("Copy", { timeout: 2500 });
  expect(host.unexpected).toEqual([]);
});

test("raw view still computes the original payload with the generator's normalization", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, member("℀ ℁ ℅ ℆ ℃ ℉ ㍑"));
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route("**/*.wasm", async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto(`./${fileRoute}`);
    await expect(page.locator(".status-label")).toHaveText("Complete");
    await page.getByRole("listbox").getByRole("option").first().click();
    await expect(page.locator(".iscc-panel")).toHaveAttribute(
      "data-state",
      "computing",
    );
    await page.getByRole("button", { name: "Raw", exact: true }).click();
    await expect(page.locator(".raw-record")).toContainText("WARC/1.0");
    release();
    await expect(page.locator(".iscc-code")).toHaveText(
      "ISCC:EADQM55VRQDITOJQLH6D6RUPGWTK5C7FLHWJ35CRXERHLMIEZCUS3ZY",
    );
    expect(host.unexpected).toEqual([]);
  } finally {
    release();
  }
});

test("navigation during wasm loading cannot display the previous record's code", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(
    context,
    Buffer.concat([member("℀ ℁ ℅ ℆ ℃ ℉ ㍑"), member("")]),
  );
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route("**/*.wasm", async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.goto(`./${fileRoute}`);
    await expect(page.locator(".status-label")).toHaveText("Complete");
    await page.getByRole("listbox").getByRole("option").first().click();
    await expect(page.locator(".iscc-panel")).toHaveAttribute(
      "data-state",
      "computing",
    );
    await page
      .getByRole("button", { name: "Next record", exact: true })
      .click();
    await expect(page.locator(".record-heading")).toHaveText("example.org");
    release();
    await expect(page.locator(".iscc-code")).toHaveText(empty);
    expect(host.unexpected).toEqual([]);
  } finally {
    release();
  }
});

test("a wasm failure keeps text readable and explicit keyboard retry restores copy focus", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await captureClipboard(page);
  let attempts = 0;
  await context.route("**/*.wasm", (route) =>
    ++attempts === 1 ? route.abort("failed") : route.continue(),
  );
  await page.goto(`./${fileRoute.replace("#/f/", "#/r/")}/11692-1799`);
  await expect(page.locator(".record-text")).toBeVisible();
  await page.locator(".iscc-panel").scrollIntoViewIfNeeded();
  await expect(page.locator(".iscc-idle")).toContainText(
    "The code could not be computed",
  );
  await expect(page.locator(".record-heading")).toHaveText(
    "Acer Aspire 5 Spin – Auswahl – 0800Hardware",
  );
  const retry = page
    .locator(".iscc-panel")
    .getByRole("button", { name: "Try again" });
  await retry.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".iscc-code")).toHaveText(reference);
  const copy = page.getByRole("button", { name: "Copy ISCC Text-Code" });
  await expect(copy).toBeFocused();
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedText: string }).copiedText,
    ),
  ).toBe(reference);
  expect(attempts).toBe(2);
  expect(host.requests).toHaveLength(1);
  expect(host.unexpected).toEqual([]);
});
