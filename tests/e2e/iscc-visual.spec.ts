/** Compare each real Text-Code state against the supplied desktop and mobile panel design. */
import { expect, test } from "@playwright/test";
import { fileRoute, fixtureHost } from "./fixture-host.ts";

for (const width of [1440, 390]) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`${width} px, ${theme}`, () => {
      test.use({
        viewport: { width, height: width === 1440 ? 1000 : 844 },
        colorScheme: theme,
        reducedMotion: "reduce",
      });

      test("idle, computing and ready panels match the reviewed layout", async ({
        page,
        context,
      }) => {
        const host = await fixtureHost(context, "real-head.warc.wet.gz");
        // Hold only automatic ISCC observation; the real manual action drives every state.
        await page.addInitScript(() => {
          window.IntersectionObserver = new Proxy(IntersectionObserver, {
            construct(Target, args) {
              const [callback, options] = args as [
                IntersectionObserverCallback,
                IntersectionObserverInit | undefined,
              ];
              return new Target((entries, observer) => {
                const visible = entries.filter(
                  (entry) => entry.target.localName !== "iscc-panel",
                );
                if (visible.length) callback(visible, observer);
              }, options);
            },
          });
        });
        let release = () => {};
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        await context.route("**/*.wasm", async (route) => {
          await held;
          await route.continue();
        });
        try {
          await page.goto(`./${fileRoute.replace("#/f/", "#/r/")}/11692-1799`);
          await expect(page.locator(".record-text")).toBeVisible();
          await page.evaluate(() => document.fonts.ready);
          const panel = page.locator(".iscc-panel");
          const suffix = `${width}-${theme}`;
          await panel.scrollIntoViewIfNeeded();
          await expect(panel).toHaveAttribute("data-state", "idle");
          await expect(panel).toHaveScreenshot(`iscc-idle-${suffix}.png`, {
            animations: "disabled",
          });
          await panel
            .getByRole("button", { name: "Compute", exact: true })
            .click();
          await expect(panel).toHaveAttribute("data-state", "computing");
          await expect(panel.getByRole("progressbar")).not.toHaveAttribute(
            "aria-valuenow",
          );
          await expect(panel).toHaveScreenshot(`iscc-computing-${suffix}.png`, {
            animations: "disabled",
          });
          release();
          await expect(panel).toHaveAttribute("data-state", "ready");
          await expect(panel.locator(".iscc-code")).toHaveText(
            "ISCC:EAD7FBRUORDROH5TB3F4IYW5YFUPZR5PKR3BEIMQSGSZSY6VMJHDDVQ",
          );
          await expect(panel).toHaveScreenshot(`iscc-ready-${suffix}.png`, {
            animations: "disabled",
          });
          await expect(page).toHaveScreenshot(`iscc-reader-${suffix}.png`, {
            animations: "disabled",
            caret: "hide",
          });
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
          expect(
            await panel.evaluate(
              (element) => element.scrollWidth <= element.clientWidth,
            ),
          ).toBe(true);
          expect(host.unexpected).toEqual([]);
        } finally {
          release();
        }
      });
    });
  }
}
