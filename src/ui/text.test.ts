/** Verify bounded reader pages preserve long lines, line endings, and Unicode. */
import { expect, test } from "vitest";
import {
  characterCount,
  middle,
  TEXT_PAGE,
  textHeading,
  textPageEnd,
  textPages,
  textTailStart,
} from "./text.ts";

test("heading promotion preserves body whitespace and falls back only for blank text", () => {
  const source = "\n  \r\n  Page title  \r\n Body\r\n";
  const heading = textHeading(source, "example.org");
  expect(heading.title).toBe("Page title");
  expect(source.slice(heading.bodyStart)).toBe(" Body\r\n");
  expect(textHeading("  \n\n", "example.org")).toEqual({
    title: "example.org",
    bodyStart: 0,
  });
  expect(textHeading("صفحة عربية\nالنص", "example.org").title).toBe(
    "صفحة عربية",
  );
});

test("a 500,000-character single line renders in bounded, lossless pages", () => {
  const text = `${"😀".repeat(4000)}\r\n${"a".repeat(500000)}\nEnd`;
  const pages = textPages(text);
  for (const page of pages) {
    expect(page.length).toBeLessThanOrEqual(TEXT_PAGE);
    expect(page).not.toMatch(/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u);
  }
  expect(pages.join("")).toBe(text);
  expect(characterCount(text)).toBe(504006);
  expect(text.slice(textTailStart(text))).toHaveLength(TEXT_PAGE);
  expect(textPages("")).toEqual([]);
  expect(textPages("Short title")).toEqual(["Short title"]);
});

test("page and tail boundaries never cut a supplementary Unicode character", () => {
  const text = `${"x".repeat(7999)}😀${"y".repeat(7999)}`;
  expect(textPageEnd(text, 0)).toBe(7999);
  expect(textTailStart(text)).toBe(8001);
  expect(middle("0123456789", 7)).toBe("012…789");
});
