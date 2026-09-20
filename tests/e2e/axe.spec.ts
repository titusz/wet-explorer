/** Audit archive navigation, reading, and recovery with the real axe engine offline. */

import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import type { NodeResult } from "axe-core";
import { fileRoute, fixtureHost } from "./fixture-host.ts";

/** Recognize only the two manually verified contrast cases documented with token ratios. */
function reviewedContrast(node: NodeResult): boolean {
  const target = node.target[0];
  if (typeof target !== "string") return false;
  return (
    (target.startsWith(".mobile-breadcrumb > a") &&
      !!node.failureSummary?.includes("only non-text characters")) ||
    (/^\.crawl-option:nth-child\(6\) > (span|small)$/.test(target) &&
      !!node.failureSummary?.includes("overlapped by another element"))
  );
}

/** Keep the complete audit evidence and report actionable violations for each visible state. */
async function audit(
  page: Page,
  testInfo: TestInfo,
  state: string,
): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  const result = await new AxeBuilder({ page }).analyze();
  const report = testInfo.outputPath(`axe-${state}.json`);
  await writeFile(
    report,
    JSON.stringify(
      { violations: result.violations, incomplete: result.incomplete },
      null,
      2,
    ),
  );
  await testInfo.attach(`axe-${state}.json`, {
    path: report,
    contentType: "application/json",
  });
  expect
    .soft(
      result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          reason: node.failureSummary,
        })),
      })),
      `${state} must have no axe violations`,
    )
    .toEqual([]);
  expect
    .soft(
      result.incomplete.flatMap((rule) =>
        rule.nodes.filter(
          (node) => rule.id !== "color-contrast" || !reviewedContrast(node),
        ),
      ),
      `${state} must have no unreviewed incomplete checks`,
    )
    .toEqual([]);
}

for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${width} px, ${theme}`, () => {
      test.use({
        viewport: { width, height: width === 1440 ? 1000 : 844 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });

      test("core views and recovery states have no accessibility violations", async ({
        page,
        context,
      }, testInfo) => {
        test.setTimeout(120000);
        const host = await fixtureHost(context, "real-head.warc.wet.gz");
        await page.goto("./");
        await expect(page.locator(".landing")).toBeVisible();
        await audit(page, testInfo, "landing");
        await page.locator("year-group").last().locator("summary").click();
        await expect(
          page.locator("year-group").last().locator(".crawl-option"),
        ).toHaveCount(8);
        await audit(page, testInfo, "older-crawls");
        await page
          .getByRole("link", { name: "Choose a file yourself" })
          .click();
        await expect(page.locator(".segment-cell")).toHaveCount(3);
        await audit(page, testInfo, "segments");
        await page.locator(".segment-cell").first().click();
        if (width === 390)
          await page.locator(".file-range > summary").first().click();
        await expect(page.locator(".file-cell").first()).toBeVisible();
        await audit(page, testInfo, "files");
        await page.locator(".file-cell").first().click();
        await expect(page.locator(".status-label")).toHaveText("Complete");
        await audit(page, testInfo, "stream-complete");
        await page
          .locator(".filter-controls input[type=search]")
          .fill("no-fixture-match-for-axe");
        await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(
          0,
        );
        await audit(page, testInfo, "filter-empty");
        await page
          .getByRole("form", { name: "Filter records already read" })
          .getByRole("button", { name: "Clear filters", exact: true })
          .click();
        await page.getByRole("listbox").getByRole("option").nth(1).click();
        await expect(page.locator(".record-text")).toBeVisible();
        await audit(page, testInfo, "reader");
        await page.getByRole("button", { name: "Raw", exact: true }).click();
        await expect(page.locator(".raw-record")).toBeVisible();
        await audit(page, testInfo, "raw");
        await page.getByRole("button", { name: "Reader", exact: true }).click();
        await page.locator(".iscc-panel").scrollIntoViewIfNeeded();
        await expect(page.locator(".iscc-code")).toBeVisible();
        await page.locator(".technical-details > summary").click();
        await audit(page, testInfo, "iscc-and-details");
        await page.goto(`./${fileRoute.replace("#/f/", "#/r/")}/11692-1799`);
        await page.reload();
        await expect(page.locator(".record-text")).toBeVisible();
        await audit(page, testInfo, "permanent-record");
        host.damaged = true;
        await page.reload();
        await expect(page.locator(".record-text")).toHaveCount(0);
        await expect(page.locator(".reader-error")).toBeVisible();
        await audit(page, testInfo, "record-error");
        await page.goto("./#/invalid-path");
        await audit(page, testInfo, "invalid-link");
        expect(host.unexpected).toEqual([]);
      });
    });
  }
}
