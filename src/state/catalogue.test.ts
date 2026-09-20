/** Check the optional catalogue against the recorded static release list. */
import { expect, test } from "vitest";
import boundary from "../../data/crawl-format-boundary.json";
import data from "../../data/crawls-source.json";
import published from "../../public/crawls.json";
import { parseFilePath } from "../cc/urls.ts";
import { parseCrawls } from "./catalogue.ts";
import years from "./crawl-years.json";

test("the selectable catalogue starts at the modern filename transition", () => {
  const crawls = parseCrawls(data.toReversed());
  expect(crawls[0]?.id).toBe("CC-MAIN-2026-34");
  expect(crawls.at(-1)?.id).toBe("CC-MAIN-2017-22");
  expect(crawls.length).toBeLessThan(data.length);
  expect(published).toEqual(crawls);
  expect(years.at(-1)).toEqual({ year: 2017, count: 8 });
});

test("recorded boundary paths confirm the supported and unsupported formats", () => {
  for (const entry of boundary) {
    const supported = entry.crawl === "CC-MAIN-2017-22";
    expect(!!parseFilePath(entry.first)).toBe(supported);
    expect(!!parseFilePath(entry.last)).toBe(supported);
    expect(entry.incompatiblePaths).toBe(supported ? 0 : entry.paths);
  }
  expect(() =>
    parseCrawls(data.filter((crawl) => crawl.id < "CC-MAIN-2017-22")),
  ).toThrow("No compatible crawls");
});

test("invalid static entries cannot become crawl selections", () => {
  for (const value of [
    null,
    [],
    [{}],
    [data[0], data[0]],
    [{ ...data[0], id: "../bad" }],
    [{ ...data[0], pages: -1 }],
    [{ ...data[0], year: 2000 }],
  ]) {
    expect(() => parseCrawls(value)).toThrow();
  }
});
