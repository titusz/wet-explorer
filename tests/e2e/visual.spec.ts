/** Compare the main screens in both themes at the supplied desktop and mobile widths. */
import { expect, type Page, test } from "@playwright/test";
import { filePath, parseRoute } from "../../src/cc/urls.ts";
import { emptyPreferences } from "../../src/state/persistence.ts";
import { fileRoute, fixtureHost } from "./fixture-host.ts";

/** Wait for self-hosted typefaces and compare a stable, fully painted viewport. */
async function capture(page: Page, name: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    caret: "hide",
  });
}

for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${width} px, ${theme}`, () => {
      test.use({
        viewport: { width, height: width === 1440 ? 1000 : 844 },
        colorScheme: theme,
      });

      test("landing, pickers, stream, reader and permanent link match the reviewed layout", async ({
        page,
        context,
      }) => {
        test.setTimeout(60000);
        const host = await fixtureHost(context, "real-head.warc.wet.gz");
        const suffix = `${width}-${theme}`;
        await page.goto("./");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Read the text that Common Crawl actually stores.",
        );
        await capture(page, `landing-${suffix}`);

        if (width === 390) {
          const action = await page
            .getByRole("button", { name: "Open a random file", exact: true })
            .boundingBox();
          expect(action).not.toBeNull();
          expect(action?.height).toBe(52);
          expect(action?.y).toBe(782);
        }

        await page
          .getByRole("link", { name: "Choose a file yourself" })
          .click();
        await expect(page.locator(".segment-cell")).toHaveCount(3);
        await capture(page, `segments-${suffix}`);
        await page.locator(".segment-cell").first().click();
        await expect(
          page.locator(width === 390 ? ".file-range" : ".file-cell").first(),
        ).toBeVisible();
        await capture(page, `files-${suffix}`);
        if (width === 1440) {
          const lastCell = await page
            .locator(".file-cell")
            .last()
            .boundingBox();
          expect(lastCell).not.toBeNull();
          expect((lastCell?.y ?? 1000) + (lastCell?.height ?? 0)).toBeLessThan(
            972,
          );
        }
        if (width === 390)
          await page.locator(".file-range > summary").first().click();
        await page.locator(".file-cell").first().click();
        await expect(page.locator(".status-label")).toHaveText("Complete");
        await capture(page, `stream-${suffix}`);

        await page.getByRole("listbox").getByRole("option").nth(1).click();
        await expect(page.locator(".record-heading")).toHaveText(
          "Acer Aspire 5 Spin – Auswahl – 0800Hardware",
        );
        await capture(page, `reader-${suffix}`);
        await page.reload();
        await expect(page.locator(".record-heading")).toHaveText(
          "Acer Aspire 5 Spin – Auswahl – 0800Hardware",
        );
        await expect(page.locator("record-stream")).toHaveCount(0);
        await capture(page, `permalink-${suffix}`);
        await page.goto("./");
        const saved = emptyPreferences();
        const route = parseRoute(fileRoute);
        if (route.kind !== "file")
          throw new Error("Invalid fixture file route");
        saved.last = { route: fileRoute, scrollIndex: 7839 };
        saved.visited[filePath(route.file)] = {
          rows: 7840,
          bytesRead: 24320000,
          size: 64000000,
          from: 0,
        };
        await page.evaluate(
          (preferences) =>
            localStorage.setItem("wetx:v1", JSON.stringify(preferences)),
          saved,
        );
        await page.reload();
        await expect(
          page.getByRole("region", { name: "Continue where you left off" }),
        ).toContainText("7,840 records · 38% of file read");
        await capture(page, `return-${suffix}`);
        expect(host.unexpected).toEqual([]);
      });
    });
  }
}
