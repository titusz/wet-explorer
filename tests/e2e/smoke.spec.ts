/** Verify the production shell without allowing any external requests. */
import { expect, test } from "@playwright/test";

test("static landing works under a sub-path and strict CSP", async ({
  page,
}) => {
  const failures: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== "http://127.0.0.1:43871") {
      failures.push(url.href);
      await route.abort();
    } else await route.continue();
  });
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "Read the text that Common Crawl actually stores.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Selected crawl" }),
  ).toContainText("August 2026");
  await expect(
    page.getByRole("link", { name: "Open a random file" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  expect(failures).toEqual([]);
});
