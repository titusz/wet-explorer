/** Verify readable and raw records, source safety, navigation, and long-text responsiveness. */
import { expect, test } from "@playwright/test";
import { fixtureRecords } from "../records.ts";
import { fileRoute, fixtureHost } from "./fixture-host.ts";
import { captureClipboard, paintAfterClick } from "./interaction.ts";

test("records already read remain usable when the browser goes offline", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await captureClipboard(page);
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Complete");
  const before = host.requests.length;
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await expect(page.locator(".record-heading")).toHaveText(
    "Acer Aspire 5 Spin – Auswahl – 0800Hardware",
  );
  await page.getByRole("button", { name: "Raw", exact: true }).click();
  await expect(page.locator(".raw-record")).toContainText("WARC/1.0");
  await page.locator(".reader-footer copy-button button").click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedText: string }).copiedText,
    ),
  ).toBe(page.url());
  await page.getByRole("button", { name: "Next record", exact: true }).click();
  await expect(page).toHaveURL(/\/13491-2038$/);
  await expect(page.locator(".record-heading")).toBeVisible();
  expect(host.requests).toHaveLength(before);
  expect(host.unexpected).toEqual([]);
});

test("cached text opens within 100 ms, raw content is exact, and copied links are canonical", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  const record = fixtureRecords("real-head.warc.wet.gz")[2];
  if (!record) throw new Error("Missing reference record");
  await captureClipboard(page);
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Complete");
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  expect(
    await paintAfterClick(
      page,
      "record-row:nth-of-type(2) .record-row",
      ".record-text",
    ),
  ).toBeLessThan(100);
  await expect(page.locator(".record-heading")).toHaveText(record.meta.title);
  expect(host.requests).toHaveLength(1);
  await page.getByRole("button", { name: "Raw", exact: true }).click();
  expect(await page.locator(".raw-record").textContent()).toBe(record.rawText);
  await page.locator(".technical-details > summary").click();
  await expect(page.locator(".technical-details")).toContainText("11692-1799");
  const copy = page.locator(".reader-footer copy-button button");
  await copy.click();
  await expect(copy).toHaveText("Copied");
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedText: string }).copiedText,
    ),
  ).toBe(page.url());
  await expect(copy).toHaveText("Copy link", { timeout: 2500 });
  await page.getByRole("button", { name: "Next record", exact: true }).click();
  await expect(page).toHaveURL(/\/13491-2038$/);
  await page.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(page).toHaveURL(/\/11692-1799$/);
  expect(host.requests).toHaveLength(1);
  expect(host.unexpected).toEqual([]);
});

test("Arabic, mixed text, and script-like sources render safely on a small screen", async ({
  page,
  context,
}) => {
  await fixtureHost(context, "synthetic-edge.warc.wet.gz");
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./${fileRoute}`);
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  await page.getByRole("listbox").getByRole("option").nth(2).click();
  await expect(page.locator(".record-text")).toHaveCSS("direction", "rtl");
  await expect(page.locator(".meta-chips")).toHaveCSS("direction", "ltr");
  await expect(page.locator(".meta-chips")).toContainText("Arabic");
  await page.keyboard.press("j");
  await expect(page.locator(".record-heading")).toContainText("A mixed page");
  await expect(page.locator(".record-text")).toHaveCSS("direction", "ltr");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("listbox").getByRole("option").nth(9).click();
  await expect(page.locator(".record-heading")).toContainText(
    '<script>alert("text only")</script>',
  );
  expect(await page.locator("wet-reader script").count()).toBe(0);
  expect(await page.locator('wet-reader a[href^="javascript:"]').count()).toBe(
    0,
  );
  expect(dialogs).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  const footer = await page.locator(".reader-footer").boundingBox();
  expect(footer && footer.y + footer.height).toBeLessThanOrEqual(844);
});

test("a 500,000-character record opens in a bounded window and reveals more on scroll", async ({
  page,
  context,
}) => {
  await fixtureHost(context, "synthetic-edge.warc.wet.gz");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`./${fileRoute}`);
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  expect(
    await paintAfterClick(
      page,
      "record-row:nth-of-type(2) .record-row",
      ".record-text",
    ),
  ).toBeLessThan(100);
  const text = page.locator(".record-text");
  const initial = (await text.textContent())?.length ?? 0;
  expect(initial).toBeGreaterThan(0);
  expect(initial).toBeLessThan(20000);
  await expect(page.locator(".record-text")).toHaveCSS(
    "animation-name",
    "none",
  );
  await page.locator(".reader-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(async () => (await text.textContent())?.length ?? 0)
    .toBeGreaterThan(initial);
  await page
    .getByRole("button", { name: "Jump to the end", exact: true })
    .click();
  await expect(page.locator(".skipped-text")).toContainText(
    "earlier characters",
  );
  expect((await text.textContent())?.length).toBeLessThanOrEqual(8002);
  await page
    .getByRole("button", { name: "Read from the start", exact: true })
    .click();
  await expect(page.locator(".skipped-text")).toHaveCount(0);
  await expect(page.locator(".reveal-marker")).toContainText(
    "characters remaining",
  );
});

test("keyboard reading supports J/K, raw, copy, Escape focus, and pause/continue", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context);
  host.latency = 300;
  await captureClipboard(page);
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Paused");
  const list = page.getByRole("listbox");
  await list.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".record-heading")).toBeFocused();
  const first = page.url();
  await page.keyboard.press("j");
  await expect(page).not.toHaveURL(first);
  await expect(page.locator(".record-heading")).toBeFocused();
  await page.keyboard.press("k");
  await expect(page).toHaveURL(first);
  await expect(page.locator(".record-heading")).toBeFocused();
  await page.keyboard.press("t");
  await expect(page.locator(".raw-record")).toBeVisible();
  await page.keyboard.press("c");
  await expect(page.locator(".reader-footer copy-button button")).toHaveText(
    "Copied",
  );
  await page.keyboard.press("j");
  await expect(page).not.toHaveURL(first);
  await expect(page.locator(".record-heading")).toBeFocused();
  const selectedOffset = page.url().split("/").at(-1)?.split("-")[0];
  await page.keyboard.press("Escape");
  await expect(list).toBeFocused();
  await expect(list).toHaveAttribute(
    "aria-activedescendant",
    `row-${selectedOffset}`,
  );
  await page.keyboard.press("Space");
  await expect(page.locator(".status-label")).toHaveText("Reading");
  await page.keyboard.press("Space");
  await expect(page.locator(".status-label")).toHaveText("Paused");
});
