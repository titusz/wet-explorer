/** Exercise the virtual stream, automatic read-ahead, and status states in real engines. */
import { expect, test } from "@playwright/test";
import { fileRoute, fixtureHost } from "./fixture-host.ts";

test("read-ahead pauses, scroll resumes, and only a bounded row window is mounted", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Paused");
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  expect(
    await page.getByRole("listbox").getByRole("option").count(),
  ).toBeLessThan(40);
  const before = host.requests.length;
  await page.getByRole("listbox").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => host.requests.length).toBeGreaterThan(before);
  await expect(page.locator(".status-label")).toHaveText("Paused");
  expect(
    await page.getByRole("listbox").getByRole("option").count(),
  ).toBeLessThan(40);
  await page.getByRole("listbox").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toHaveAttribute(
    "aria-activedescendant",
    /row-\d+/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  expect(host.unexpected).toEqual([]);
  expect(failures).toEqual([]);
});

test("connecting, waiting, and complete show honest progress with a pause action", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  host.latency = 300;
  host.busy = 1;
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Connecting");
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".busy-caption")).toContainText(
    "Common Crawl is busy. Continuing in",
  );
  await expect(page.locator(".status-label")).toHaveText("Complete", {
    timeout: 7000,
  });
  await expect(page.locator(".status-caption")).toContainText(
    "49 records read",
  );
  await expect(
    page.getByRole("progressbar", { name: "File bytes read" }),
  ).toHaveAttribute("value", "150185");
  expect(host.requests).toHaveLength(2);
  expect(host.unexpected).toEqual([]);
});

test("an interrupted decoder retains its stream and Continue retries the same safe offset", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  host.damaged = true;
  await page.goto(`./${fileRoute}`);
  await expect(page.locator(".status-label")).toHaveText("Interrupted");
  host.damaged = false;
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".status-label")).toHaveText("Complete");
  expect(host.requests[1]?.range).toBe("bytes=0-4194303");
  expect(host.unexpected).toEqual([]);
});
