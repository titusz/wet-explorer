/** Exercise keyboard navigation and contrast of focus indicators in both themes. */
import { expect, type Locator, type Page, test } from "@playwright/test";
import { fixtureHost } from "./fixture-host.ts";
import { captureClipboard } from "./interaction.ts";

/** Calculate WCAG relative luminance from an opaque computed RGB color. */
function luminance(color: string): number {
  const values = color.match(/[\d.]+/g)?.map(Number);
  if (
    !values ||
    values.length < 3 ||
    (values[3] !== undefined && values[3] !== 1)
  )
    throw new Error(`Expected opaque RGB color: ${color}`);
  return values.slice(0, 3).reduce((sum, channel, index) => {
    const value = channel / 255;
    const linear =
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return sum + linear * ([0.2126, 0.7152, 0.0722][index] ?? 0);
  }, 0);
}

/** Compare two rendered solid colors without rounding the acceptance threshold. */
function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Reach a control using ordinary forward or backward Tab traversal. */
async function tabTo(
  page: Page,
  target: Locator,
  reverse = false,
): Promise<void> {
  await expect(target).toBeVisible();
  const key = reverse ? "Shift+Tab" : "Tab";
  const path: string[] = [];
  for (let step = 0; step < 30; step++) {
    if (await target.evaluate((element) => element === document.activeElement))
      return;
    path.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        return `${active?.tagName}#${active?.id} ${active?.getAttribute("aria-label") ?? active?.textContent?.slice(0, 70)} [details=${active?.closest("details")?.open}]`;
      }),
    );
    await page.keyboard.press(key);
  }
  console.log(`Tab sequence for ${target}: ${JSON.stringify(path)}`);
  await expect(target).toBeFocused();
}

/** Require a visible two-pixel focus indicator against its adjacent background. */
async function focusContrast(
  target: Locator,
  background: Locator,
): Promise<void> {
  const foreground = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.outlineColor,
      width: Number.parseFloat(style.outlineWidth),
      style: style.outlineStyle,
    };
  });
  const color = await background.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(foreground.style).toBe("solid");
  expect(foreground.width).toBeGreaterThanOrEqual(2);
  expect(contrast(foreground.color, color)).toBeGreaterThanOrEqual(3);
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: keyboard reaches every archive level, reader actions and local filters with visible focus`, async ({
    page,
    context,
  }) => {
    const host = await fixtureHost(context, "real-head.warc.wet.gz");
    await captureClipboard(page);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("./");
    await tabTo(page, page.locator(".wordmark"));
    await focusContrast(page.locator(".wordmark"), page.locator(".app-header"));
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("button", { name: "Switch theme" }),
    ).toBeFocused();
    await focusContrast(
      page.locator(".theme-button"),
      page.locator(".app-header"),
    );
    await tabTo(
      page,
      page.getByRole("link", { name: "Choose a file yourself" }),
    );
    await page.keyboard.press("Enter");
    await tabTo(page, page.locator(".segment-cell").first());
    await page.keyboard.press("Enter");
    await tabTo(
      page,
      page.getByRole("link", { name: "File 00000", exact: true }),
    );
    await page.keyboard.press("Enter");
    const list = page.getByRole("listbox");
    await tabTo(page, list);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.locator(".record-heading")).toBeFocused();
    const recordLink = page.url();
    const copy = page.locator(".reader-footer copy-button button");
    await tabTo(page, copy);
    await page.keyboard.press("Enter");
    await expect(copy).toHaveText("Copied");
    expect(
      await page.evaluate(
        () => (window as unknown as { copiedText: string }).copiedText,
      ),
    ).toBe(recordLink);
    await tabTo(
      page,
      page.getByRole("button", { name: "Next record", exact: true }),
    );
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(recordLink);
    await expect(page.locator(".record-heading")).toBeFocused();
    await tabTo(page, list, true);
    const selected = list.locator('.record-row.active[aria-selected="true"]');
    await focusContrast(selected, selected);
    await page.keyboard.press("Enter");
    await expect(page.locator(".record-heading")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(list).toBeFocused();
    await focusContrast(
      list.locator(".record-row.active"),
      page.locator("record-stream"),
    );
    await expect(page.locator(".status-label")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await page.keyboard.press("/");
    const filter = page.getByRole("searchbox", {
      name: "Filter by title or host",
    });
    await expect(filter).toBeFocused();
    await page.keyboard.type("no such invented title");
    await expect(page.locator(".list-message")).toContainText("No matches");
    await tabTo(
      page,
      page.getByRole("button", { name: "Clear filters", exact: true }).first(),
    );
    await page.keyboard.press("Enter");
    await expect(list.getByRole("option").first()).toBeVisible();
    expect(host.unexpected).toEqual([]);
  });
}
