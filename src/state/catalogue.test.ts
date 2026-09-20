/** Check the optional catalogue against the recorded static release list. */
import { expect, test } from "vitest";
import data from "../../data/crawls-source.json";
import { parseCrawls } from "./catalogue.ts";

test("the source catalogue is ordered newest first with valid page counts", () => {
  const crawls = parseCrawls(data.toReversed());
  expect(crawls[0]?.id).toBe("CC-MAIN-2026-34");
  expect(crawls.at(-1)?.id).toBe("CC-MAIN-2013-20");
  expect(crawls).toHaveLength(data.length);
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
