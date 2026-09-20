/** Enforce immediate feedback for local controls and network-backed navigation. */
import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { fixtureHost } from "./fixture-host.ts";
import { captureClipboard, paintAfterClick } from "./interaction.ts";

test.use({
  trace: {
    mode: "retain-on-failure",
    screenshots: false,
    snapshots: true,
    sources: true,
  },
});

/** Measure a visible control through the first paint of its distinct response. */
async function measure(
  page: Page,
  action: string,
  target: string,
  ready: string,
) {
  await page.locator(target).scrollIntoViewIfNeeded();
  await expect(page.locator(target)).toBeVisible();
  await expect(page.locator(ready)).toHaveCount(0);
  const ms = await paintAfterClick(page, target, ready);
  await expect(page.locator(ready)).toBeVisible();
  expect
    .soft(ms, `${action} must show a response within 100 ms`)
    .toBeLessThan(100);
  return { action, ms };
}

for (const width of [1440, 390]) {
  test(`${width} px: navigation and reader controls respond within 100 ms`, async ({
    page,
    context,
  }, testInfo) => {
    const host = await fixtureHost(context, "real-head.warc.wet.gz");
    host.latency = 400;
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.emulateMedia({ colorScheme: "light" });
    await captureClipboard(page);
    await page.goto("./");
    await expect(page.locator(".landing")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const timings = [];
    timings.push(
      await measure(page, "theme", ".theme-button", 'html[data-theme="dark"]'),
    );
    timings.push(
      await measure(
        page,
        "dismiss notice",
        ".first-notice button",
        "wet-app:not(:has(.first-notice)) .landing",
      ),
    );
    timings.push(
      await measure(
        page,
        "random-file loading feedback",
        "random-file .primary-action",
        ".random-intent button:disabled",
      ),
    );
    await expect(page.locator(".status-label")).toHaveText("Complete");
    timings.push(
      await measure(
        page,
        "cached record",
        "record-row:nth-of-type(2) button",
        ".record-text",
      ),
    );
    timings.push(
      await measure(
        page,
        "raw view",
        ".raw-toggle button:nth-child(2)",
        ".raw-record",
      ),
    );
    timings.push(
      await measure(
        page,
        "reader view",
        ".raw-toggle button:first-child",
        ".record-text",
      ),
    );
    timings.push(
      await measure(
        page,
        "technical details",
        ".technical-details > summary",
        ".technical-details[open]",
      ),
    );
    timings.push(
      await measure(
        page,
        "copy acknowledgement",
        ".reader-footer copy-button button",
        ".reader-footer .has-feedback",
      ),
    );
    timings.push(await measure(page, "home", ".wordmark", ".landing"));
    timings.push(
      await measure(
        page,
        "segment picker",
        ".action-caption a",
        ".segment-grid",
      ),
    );
    timings.push(
      await measure(
        page,
        "file picker",
        ".segment-cell:first-child",
        "file-grid",
      ),
    );
    if (width === 390)
      timings.push(
        await measure(
          page,
          "hundred-file disclosure",
          ".file-range:first-child > summary",
          ".file-range[open] .file-grid",
        ),
      );
    timings.push(
      await measure(
        page,
        "file connection feedback",
        width === 390
          ? ".file-range:first-child .file-cell:first-child"
          : ".file-grid-row:first-child .file-cell:first-child",
        ".stream-layout",
      ),
    );
    await expect(page.locator(".status-label")).toHaveText("Complete");
    timings.push(
      await measure(
        page,
        "hide short records",
        ".short-filter input",
        ".filter-controls .clear-filter",
      ),
    );
    timings.push(
      await measure(
        page,
        "clear filters",
        ".filter-controls .clear-filter",
        ".filter-controls:not(:has(.clear-filter))",
      ),
    );
    const measurementPath = testInfo.outputPath("interaction-latency.json");
    await writeFile(measurementPath, JSON.stringify(timings, null, 2));
    await testInfo.attach("interaction-latency.json", {
      path: measurementPath,
      contentType: "application/json",
    });
    console.log(
      `${testInfo.project.name}, ${width} px: slowest response ${Math.max(...timings.map((timing) => timing.ms)).toFixed(1)} ms`,
    );
    expect(host.unexpected).toEqual([]);
  });
}
