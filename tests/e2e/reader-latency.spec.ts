/** Measure fresh permanent-link paint without screenshot-tracing overhead. */

import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { fileRoute, fixtureHost } from "./fixture-host.ts";
import { captureClipboard, paintAfterClick } from "./interaction.ts";

test.use({
  trace: {
    mode: "retain-on-failure",
    screenshots: false,
    snapshots: true,
    sources: true,
  },
});

test("a 500,000-character title expands within 100 ms and remains fully readable and copyable", async ({
  page,
  context,
}, testInfo) => {
  const title = `${"An invented title with supplementary 😀 characters. ".repeat(11000).slice(0, 499980)} End of title.`;
  const payload = Buffer.from(`${title}\nA paragraph after the title.\n`);
  const compressed = gzipSync(
    Buffer.concat([
      Buffer.from(
        `WARC/1.0\r\nWARC-Type: conversion\r\nWARC-Target-URI: https://example.org/long-title\r\nContent-Length: ${payload.length}\r\n\r\n`,
      ),
      payload,
      Buffer.from("\r\n\r\n"),
    ]),
  );
  const host = await fixtureHost(context, compressed);
  await captureClipboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `./${fileRoute.replace("#/f/", "#/r/")}/0-${compressed.length}`,
  );
  await expect(page.locator(".record-heading")).not.toBeEmpty();
  const collapsedTitle = await page.locator(".record-heading").textContent();
  expect(Array.from(collapsedTitle ?? "")).toHaveLength(301);
  const paintMs = await paintAfterClick(
    page,
    ".record-header > .text-button",
    '.record-header > .text-button[aria-expanded="true"]',
  );
  console.log(
    `${testInfo.project.name}: oversized title expansion ${paintMs.toFixed(1)} ms`,
  );
  expect(paintMs).toBeLessThan(100);
  expect(await page.locator(".record-heading").textContent()).toBe(title);
  const pages = page.locator(".title-page");
  expect(await pages.count()).toBeGreaterThan(50);
  await expect(pages.first()).toHaveCSS("content-visibility", "auto");
  await pages
    .last()
    .evaluate((element) => element.scrollIntoView({ block: "end" }));
  await expect(pages.last()).toBeInViewport();
  await expect(pages.last()).toContainText("End of title.");
  await page
    .getByRole("button", { name: "Copy full title", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedText: string }).copiedText,
    ),
  ).toBe(title);
  await page
    .getByRole("button", { name: "Collapse title", exact: true })
    .click();
  await expect(page.locator(".record-heading")).toHaveText(
    collapsedTitle ?? "",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  expect(host.requests).toHaveLength(1);
  expect(host.unexpected).toEqual([]);
});

test("a fresh permanent link meets its paint budget, fetches one range, and Next reads forward", async ({
  page,
  context,
}, testInfo) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  host.latency = 175;
  await page.addInitScript(() => {
    const start = performance.now();
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".record-text")?.textContent) return;
      observer.disconnect();
      requestAnimationFrame(() =>
        setTimeout(() => {
          Object.defineProperty(window, "recordPaintMs", {
            value: performance.now() - start,
          });
        }, 0),
      );
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto(`./${fileRoute.replace("#/f/", "#/r/")}/11692-1799`);
  await expect(page.locator(".record-heading")).not.toBeEmpty();
  await page.waitForFunction(() => "recordPaintMs" in window);
  const paintMs = await page.evaluate(
    () => (window as unknown as { recordPaintMs: number }).recordPaintMs,
  );
  await testInfo.attach("permanent-link-paint.json", {
    body: JSON.stringify({ paintMs, networkLatencyMs: host.latency }),
    contentType: "application/json",
  });
  console.log(
    `${testInfo.project.name}: permanent-link paint ${paintMs.toFixed(1)} ms including ${host.latency} ms network latency`,
  );
  expect(paintMs).toBeLessThan(400 + host.latency);
  expect(host.requests.map((request) => request.range)).toEqual([
    "bytes=11692-13490",
  ]);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next record", exact: true }).click();
  await expect(page).toHaveURL(/\/13491-2038$/);
  expect(host.requests[1]?.range).toBe("bytes=13491-4194303");
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  expect(host.unexpected).toEqual([]);
});
