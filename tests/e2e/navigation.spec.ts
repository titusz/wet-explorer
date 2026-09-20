/** Exercise the full archive hierarchy without requests to the live data host. */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { parsePaths } from "../../src/cc/paths.ts";
import { filePath, fileUrl, routeHash } from "../../src/cc/urls.ts";
import { fixtureHost } from "./fixture-host.ts";

const crawl = "CC-MAIN-2026-34";
const paths = parsePaths(
  gunzipSync(
    readFileSync(new URL("../fixtures/paths-sample.gz", import.meta.url)),
  ).toString(),
  crawl,
);
const first = paths.files[0];
const target = paths.files[843];
if (!first || !target) throw new Error("Missing manifest fixture entries");
const crawlRoute = `#/c/${crawl}`;
const segmentRoute = `${crawlRoute}/${first.segment}`;

test("a standalone record explains unknown earlier records and can read its file from the start", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await page.goto(
    `./${routeHash({ kind: "record", file: first, offset: 11692, length: 1799 })}`,
  );
  await expect(page.locator(".record-heading")).toBeVisible();
  await expect(page.locator(".permalink-context")).toContainText(
    "Records before this one are unknown",
  );
  expect(host.requests).toHaveLength(1);
  await page
    .getByRole("link", { name: "Read this file from the start", exact: true })
    .click();
  await expect(page.locator(".status-label")).toHaveText("Complete");
  await expect(page.locator(".stream-scope")).toContainText("49 records read");
  expect(host.requests.map((request) => request.range)).toEqual([
    "bytes=11692-13490",
    "bytes=0-4194303",
  ]);
  expect(host.unexpected).toEqual([]);
});

test("landing waits for intent, shares one manifest load, and random opens readable text", async ({
  page,
  context,
  browser,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "Read the text that Common Crawl actually stores.",
    }),
  ).toBeVisible();
  expect(host.requests).toEqual([]);
  const random = page.getByRole("button", { name: "Open a random file" });
  await random.hover();
  await expect.poll(() => host.requests.length).toBe(1);
  expect(host.requests[0]?.url).toMatch(/wet\.paths\.gz$/);
  await random.click();
  await expect(
    page.getByRole("listbox").getByRole("option").nth(1),
  ).toBeVisible();
  expect(host.requests).toHaveLength(2);
  expect(host.requests[1]?.range).toBe("bytes=0-4194303");
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await expect(page.locator(".record-heading")).toHaveText(
    "Acer Aspire 5 Spin – Auswahl – 0800Hardware",
  );
  const url = page.url();
  const fresh = await browser.newContext();
  try {
    const freshHost = await fixtureHost(fresh, "real-head.warc.wet.gz");
    const linked = await fresh.newPage();
    await linked.goto(url);
    await expect(linked.locator(".record-heading")).toHaveText(
      (await page.locator(".record-heading").textContent()) ?? "",
    );
    expect(freshHost.requests).toHaveLength(1);
    expect(freshHost.requests[0]?.range).toBe("bytes=11692-13490");
    expect(freshHost.unexpected).toEqual([]);
  } finally {
    await fresh.close();
  }
  expect(host.unexpected).toEqual([]);
});

test("manual drill-down and browser history reproduce every archive level", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await page.goto("./");
  await page.getByRole("link", { name: "Choose a file yourself" }).click();
  await expect(page.locator(".segment-cell")).toHaveCount(3);
  await expect(page.locator("[aria-current=step]")).toContainText("Segment");
  await page
    .getByRole("link", { name: "Segment 1 of 3, 1,000 files", exact: true })
    .click();
  await expect(page.locator(".file-cell")).toHaveCount(1000);
  await page.getByRole("link", { name: "File 00843", exact: true }).click();
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  await page.getByRole("listbox").getByRole("option").nth(1).click();
  await expect(page.locator(".record-heading")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".reader-empty")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".file-cell")).toHaveCount(1000);
  await page.goBack();
  await expect(page.locator(".segment-cell")).toHaveCount(3);
  await page.goBack();
  await expect(page.locator(".landing")).toBeVisible();
  await page.goForward();
  await expect(page.locator(".segment-cell")).toHaveCount(3);
  await page.goForward();
  await expect(page.locator(".file-cell")).toHaveCount(1000);
  await page.goForward();
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  await page.goForward();
  await expect(page.locator(".record-heading")).toBeVisible();
  expect(
    host.requests.filter((request) => request.url.endsWith("wet.paths.gz")),
  ).toHaveLength(1);
  expect(host.unexpected).toEqual([]);
});

test("jump accepts all reference forms and resolves a number across segment boundaries", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  const forms = [
    "843",
    "00843",
    `CC-MAIN-${target.file}.warc.wet.gz`,
    fileUrl(target),
    `s3://commoncrawl/${filePath(target)}`,
    filePath(target),
    `http://127.0.0.1:43871/wet-explorer/${routeHash({ kind: "file", file: target })}`,
  ];
  await page.goto(`./${segmentRoute}`);
  for (const value of forms) {
    await page
      .getByRole("textbox", { name: "File number, file name or link" })
      .fill(value);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${target.file}$`));
    await expect(
      page.getByRole("listbox").getByRole("option").first(),
    ).toBeVisible();
    await page.goBack();
    await expect(page.locator("file-grid")).toBeVisible();
  }
  const before = host.requests.length;
  await page.getByRole("textbox").fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator("#jump-error")).toContainText("not understood");
  expect(host.requests).toHaveLength(before);
  await page.getByRole("textbox").fill("99999");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator("#jump-error")).toContainText("No file");
  await page.getByRole("textbox").fill("1843");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(
    `http://127.0.0.1:43871/wet-explorer/${routeHash({ kind: "file", file: paths.files[1843] ?? first })}`,
  );
  expect(host.unexpected).toEqual([]);
});

test("mobile reveals ten ranges and only the selected hundred file cells", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./${segmentRoute}`);
  await expect(page.locator(".file-range")).toHaveCount(10);
  await expect(page.locator(".file-cell")).toHaveCount(0);
  await page.getByText("00800 – 00899", { exact: true }).click();
  await expect(page.locator(".file-cell")).toHaveCount(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByRole("link", { name: "File 00843", exact: true }).click();
  await expect(
    page.getByRole("listbox").getByRole("option").first(),
  ).toBeVisible();
  expect(host.unexpected).toEqual([]);
});

test("manifest loading and failure keep the grid shape and a working retry", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  host.busy = 1;
  host.latency = 500;
  await page.goto(`./${crawlRoute}`);
  await expect(page.locator(".grid-skeleton > span")).toHaveCount(100);
  await expect(
    page.getByRole("heading", { name: "The file list could not be loaded." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".segment-cell")).toHaveCount(3);
  expect(host.requests).toHaveLength(2);
  await page.goto(`./${crawlRoute}/99999.99`);
  await expect(
    page.getByRole("heading", { name: "This segment is not in the crawl." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Choose a segment" }).click();
  await expect(page.locator(".segment-cell")).toHaveCount(3);
  const before = host.requests.length;
  await page.goto("./#/r/../../bad");
  await expect(
    page.getByRole("heading", { name: "This link was not understood." }),
  ).toBeVisible();
  expect(host.requests).toHaveLength(before);
});

test("older years fetch the app catalogue once without fetching a WET file", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context);
  const catalogueRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("crawls.json"))
      catalogueRequests.push(request.url());
  });
  await page.goto("./");
  await expect(page.locator(".crawl-list .crawl-option")).toHaveCount(6);
  expect(catalogueRequests).toEqual([]);
  await page.locator("year-group").first().locator("summary").click();
  await expect(
    page.locator("year-group").first().locator(".crawl-option").first(),
  ).toBeVisible();
  await page.locator("year-group").nth(1).locator("summary").click();
  await expect(
    page.locator("year-group").nth(1).locator(".crawl-option").first(),
  ).toBeVisible();
  expect(catalogueRequests).toHaveLength(1);
  await expect(page.locator(".crawl-coverage")).toHaveText(
    "Crawls from May 2017 onward.",
  );
  const oldest = page.locator("year-group").last();
  await oldest.locator("summary").click();
  await expect(oldest.locator(".crawl-option")).toHaveCount(8);
  await expect(oldest.locator(".crawl-option").last()).toContainText(
    "May 2017",
  );
  await expect(oldest.locator(".crawl-option")).not.toContainText([
    "April 2017",
  ]);
  expect(host.requests).toEqual([]);
});

test("a blocked range uses the proven compatibility path for the same permanent record", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context, "real-head.warc.wet.gz");
  host.rangeBlocked = true;
  await page.goto(
    `./${routeHash({ kind: "record", file: first, offset: 11692, length: 1799 })}`,
  );
  await expect(page.locator(".record-heading")).toHaveText(
    "Acer Aspire 5 Spin – Auswahl – 0800Hardware",
  );
  expect(
    host.requests.map((request) => [request.method, request.range]),
  ).toEqual([
    ["GET", "bytes=11692-13490"],
    ["HEAD", undefined],
    ["GET", undefined],
  ]);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  expect(host.unexpected).toEqual([]);
});
