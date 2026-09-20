/** Keep archive navigation readable on desktop and ultrawide displays. */
import { expect, type Locator, test } from "@playwright/test";
import { fixtureHost } from "./fixture-host.ts";

/** Read the visible bounds used to detect collapsed or overlapping content. */
async function bounds(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected visible layout content");
  return box;
}

for (const width of [1920, 2560, 2808, 3440, 3840]) {
  test(`landing and pickers keep readable columns at ${width} px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1075 });
    const host = await fixtureHost(context, "real-head.warc.wet.gz");
    await page.goto("./");
    await page.evaluate(() => document.fonts.ready);

    const intro = await bounds(page.locator(".intro"));
    const sidebar = await bounds(page.locator(".crawl-sidebar"));
    expect(intro.width).toBeGreaterThanOrEqual(600);
    expect(sidebar.width).toBeGreaterThanOrEqual(400);
    expect(intro.x + intro.width).toBeLessThan(sidebar.x);
    expect(intro.x).toBeCloseTo(width - sidebar.x - sidebar.width);
    await expect(
      page.getByRole("button", { name: "Open a random file", exact: true }),
    ).toBeInViewport({ ratio: 1 });

    await page.getByRole("link", { name: "Choose a file yourself" }).click();
    await expect(page.locator(".segment-cell")).toHaveCount(3);
    const grid = await bounds(page.locator(".picker-grid"));
    const tools = await bounds(page.locator(".picker-tools"));
    expect(grid.width).toBeGreaterThanOrEqual(500);
    expect(tools.width).toBeGreaterThanOrEqual(450);
    expect(grid.x + grid.width).toBeLessThan(tools.x);
    expect(grid.x).toBeCloseTo(width - tools.x - tools.width);

    await page.locator(".segment-cell").first().click();
    await expect(page.locator(".file-cell").first()).toBeVisible();
    const picker = await bounds(page.locator(".picker"));
    const files = await bounds(page.locator(".desktop-files"));
    const lastFile = await bounds(page.locator(".file-cell").last());
    expect(files.width).toBeGreaterThanOrEqual(1000);
    expect(lastFile.x + lastFile.width).toBeLessThanOrEqual(
      picker.x + picker.width,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    expect(host.unexpected).toEqual([]);
  });
}
