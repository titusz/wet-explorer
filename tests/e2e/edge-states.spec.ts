/** Show tolerant metadata, damaged source text, and expanded identifiers in the reader. */
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { fileRoute, fixtureHost } from "./fixture-host.ts";
import { captureClipboard } from "./interaction.ts";

const recordBase = fileRoute.replace("#/f/", "#/r/");

test("missing title and language remain quiet, and damaged text is explained in technical details", async ({
  page,
  context,
}) => {
  await fixtureHost(context, "synthetic-edge.warc.wet.gz");
  await page.goto(`./${recordBase}/3344-201`);
  await expect(page.locator(".record-heading")).toHaveText("example.org");
  await page.goto(`./${recordBase}/217-210`);
  await expect(page.locator(".record-heading")).toHaveText(
    "A title after empty lines",
  );
  await expect(page.locator(".meta-chips")).toContainText("language unknown");
  await page.goto(`./${recordBase}/2497-207`);
  await expect(page.locator(".record-heading")).toHaveText("bad��");
  await expect(page.locator(".technical-note")).not.toBeVisible();
  await page.locator(".technical-details > summary").click();
  await expect(page.locator(".technical-note")).toContainText(
    "damaged text or incomplete source data",
  );
  await expect(
    page.getByRole("link", { name: "Common Crawl contact and opt-out" }),
  ).toHaveAttribute("href", "https://commoncrawl.org/faq");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("long titles and URLs expand and copy in full without horizontal overflow", async ({
  page,
  context,
}) => {
  const title = "An invented long title ".repeat(24).trim();
  const url = `https://example.org/${"long-path/".repeat(35)}final-page`;
  const payload = Buffer.from(`${title}\nAn invented paragraph for testing.\n`);
  const raw = Buffer.concat([
    Buffer.from(
      `WARC/1.0\r\nWARC-Type: conversion\r\nWARC-Target-URI: ${url}\r\nContent-Type: text/plain\r\nContent-Length: ${payload.length}\r\n\r\n`,
    ),
    payload,
    Buffer.from("\r\n\r\n"),
  ]);
  const compressed = gzipSync(raw);
  await fixtureHost(context, compressed);
  await captureClipboard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`./${recordBase}/0-${compressed.length}`);
  await expect(page.locator(".record-heading")).toHaveText(
    `${title.slice(0, 300).trimEnd()}…`,
  );
  await expect(page.locator(".record-url a")).toContainText(
    "https://example.org/",
  );
  await expect(page.locator(".record-url a")).toContainText("final-page");
  await page.getByRole("button", { name: "Expand title", exact: true }).click();
  await expect(page.locator(".record-heading")).toHaveText(title);
  await page
    .getByRole("button", { name: "Copy full title", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedText: string }).copiedText,
    ),
  ).toBe(title);
  await page.getByRole("button", { name: "Expand URL", exact: true }).click();
  await expect(page.locator(".record-url a")).toHaveText(url);
  await page.locator(".technical-details > summary").click();
  await page
    .getByRole("button", { name: "Copy target url", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => (window as unknown as { copiedText: string }).copiedText,
    ),
  ).toBe(url);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

test("a well-formed link to non-record bytes has a recoverable reader error", async ({
  page,
  context,
}) => {
  const host = await fixtureHost(context);
  host.damaged = true;
  await page.goto(`./${recordBase}/11692-1799`);
  await expect(
    page.getByRole("heading", { name: "This link does not point to a record" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(host.requests).toHaveLength(1);
  expect(host.unexpected).toEqual([]);
});
