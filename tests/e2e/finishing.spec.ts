/** Verify optional local state and honest filters using only recorded data. */
import { expect, test } from "@playwright/test";
import { fileRoute, fixtureHost } from "./fixture-host.ts";

test("filters affect only arrived metadata, retain short records by default, and clear locally", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "synthetic-edge.warc.wet.gz");
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Complete");
  await expect(page.getByLabel("Hide short records")).not.toBeChecked();
  await expect(page.locator(".record-row.short").first()).toBeVisible();
  const requests = host.requests.length;
  await page.getByLabel("Hide short records").check();
  await expect(page.locator(".record-row.short")).toHaveCount(0);
  await page.getByLabel("Hide short records").uncheck();
  await page.getByLabel("Language in records read").selectOption("ara");
  await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(2);
  await page.getByRole("listbox").getByRole("option").first().click();
  await expect(page.locator(".record-text")).toHaveAttribute("dir", "auto");
  await page.keyboard.press("/");
  await expect(page.getByLabel("Filter by title or host")).toBeFocused();
  await page
    .getByLabel("Filter by title or host")
    .fill("nothing matches this string");
  await expect(page.locator(".list-message")).toContainText(
    "No matches in 12 records",
  );
  await expect(page.locator(".list-message")).not.toContainText(
    "still reading",
  );
  expect(host.requests).toHaveLength(requests);
  await page
    .locator(".list-message")
    .getByRole("button", { name: "Clear filters" })
    .click();
  await expect(page.getByLabel("Language in records read")).toHaveValue("");
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  expect(host.unexpected).toEqual([]);
});

test("an empty paused filter states its limited scope and waits for explicit continuation", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context);
  host.latency = 500;
  await page.goto(`./${fileRoute}`);
  await page
    .getByLabel("Filter by title or host")
    .fill("no matching title anywhere");
  await expect(page.locator(".list-message")).toContainText("still reading");
  await expect(page.locator(".status-label")).toHaveText("Paused");
  await expect(page.locator(".list-message")).toContainText(
    "records read so far, paused",
  );
  await expect(page.locator(".file-summary")).toHaveCount(0);
  const before = host.requests.length;
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect.poll(() => host.requests.length).toBeGreaterThan(before);
  await expect(page.locator(".status-label")).toHaveText("Paused");
  await expect(page.locator(".list-message")).toContainText("No matches");
  expect(host.unexpected).toEqual([]);
});

test("end-of-file summary offers Next file and fetches its manifest only on that action", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await page.goto(`./${fileRoute}`);
  await expect(page.getByRole("region", { name: "End of file" })).toContainText(
    "49 records read",
  );
  await expect(page.getByRole("region", { name: "End of file" })).toContainText(
    "short records",
  );
  expect(host.requests).toHaveLength(1);
  await page.getByRole("button", { name: "Next file", exact: true }).click();
  await expect(page).toHaveURL(/-00001$/);
  await expect(page.locator(".status-label")).toHaveText("Complete");
  expect(host.requests.map((request) => request.range)).toEqual([
    "bytes=0-4194303",
    undefined,
    "bytes=0-4194303",
  ]);
  expect(host.unexpected).toEqual([]);
});

test("notice and theme persist, return progress is honest, and visited cells retain a marker", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await page.goto("./");
  await page
    .getByRole("button", { name: "Dismiss the raw-text notice" })
    .click();
  await page.getByRole("button", { name: "Switch theme" }).click();
  await expect(page.locator(".first-notice")).toHaveCount(0);
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Complete");
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await expect(page.locator(".record-heading")).toBeVisible();
  const lastRecord = page.url();
  await page
    .getByRole("link", { name: "WET Explorer, ISCC Foundation, home" })
    .click();
  await expect(
    page.getByRole("region", { name: "Continue where you left off" }),
  ).toContainText("49 records · 100% of file read");
  await expect(
    page.getByRole("region", { name: "Continue where you left off" }),
  ).not.toContainText("of ~");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".first-notice")).toHaveCount(0);
  await page
    .getByRole("region", { name: "Continue where you left off" })
    .getByRole("link", { name: "Continue" })
    .click();
  await expect(page).toHaveURL(lastRecord);
  await expect(page.locator(".record-heading")).toBeVisible();
  await page
    .locator(".archive-breadcrumb")
    .getByRole("link", { name: "File 00000", exact: true })
    .click();
  await expect(page.locator(".file-cell[data-visited=true]")).toHaveCount(1);
  await expect(
    page.locator(".file-cell[data-visited=true] progress"),
  ).toHaveAttribute("value", "1");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("wetx:v1") ?? "null"),
  );
  expect(saved.version).toBe(1);
  const visit = Object.values(saved.visited)[0] as { rows: number } | undefined;
  expect(visit?.rows).toBe(49);
  expect(host.unexpected).toEqual([]);
});

test("denied local storage leaves all reading and dismissal actions usable", async ({
  page,
  context,
}) => {
  await fixtureHost(context, "real-head.warc.wet.gz");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get: () => {
        throw new Error("Storage denied");
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await page
    .getByRole("button", { name: "Dismiss the raw-text notice" })
    .click();
  await page.getByRole("button", { name: "Open a random file" }).click();
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await expect(page.locator(".record-heading")).toBeVisible();
  await page
    .getByRole("link", { name: "WET Explorer, ISCC Foundation, home" })
    .click();
  await expect(page.locator(".return-position")).toBeVisible();
  await page.reload();
  await expect(page.locator(".return-position")).toHaveCount(0);
  await expect(page.locator(".first-notice")).toBeVisible();
  expect(errors).toEqual([]);
});

test("return copy uses records read plus byte progress, and cleared storage removes it", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context);
  await page.goto("./");
  await page.evaluate((route) => {
    localStorage.setItem(
      "wetx:v1",
      JSON.stringify({
        version: 1,
        noticeDismissed: true,
        theme: "system",
        last: { route, scrollIndex: 100 },
        visited: {
          "crawl-data/CC-MAIN-2026-34/segments/1786091384908.68/wet/CC-MAIN-20260807101845-20260807131845-00000.warc.wet.gz":
            { bytesRead: 380000, size: 1000000, rows: 7840, from: 0 },
        },
      }),
    );
  }, fileRoute);
  await page.reload();
  await expect(page.locator(".return-position")).toContainText(
    "7,840 records · 38% of file read",
  );
  await expect(page.locator(".return-position")).not.toContainText("20,600");
  expect(host.requests).toEqual([]);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator(".return-position")).toHaveCount(0);
  await expect(page.locator(".first-notice")).toBeVisible();
  expect(host.requests).toEqual([]);
});

test("forward progress and summary exclude bytes and records before the starting position", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await page.goto(`./${fileRoute}?from=11692`);
  await expect(page.locator(".file-summary")).toContainText(
    "48 records read from this position",
  );
  await expect(page.locator(".status-caption")).toContainText(
    "From this position: 138.5 KB",
  );
  const progress = page.getByRole("progressbar", {
    name: "Bytes read from this position",
  });
  await expect(progress).toHaveAttribute("value", "138493");
  await expect(progress).toHaveAttribute("max", "138493");
  await page
    .getByRole("link", { name: "WET Explorer, ISCC Foundation, home" })
    .click();
  await expect(page.locator(".return-position")).toContainText(
    "48 records in the last read · 92% of file read",
  );
  expect(host.requests).toHaveLength(1);
  expect(host.requests[0]?.range).toBe("bytes=11692-4194303");
});
