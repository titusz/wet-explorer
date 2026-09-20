/** Verify catalogue parsing against archive table structure. */
import { expect, test } from "vitest";
import { parseCatalogue, parseWetStats } from "./catalogue.ts";

test("uses real labels and page counts in newest-first order", () => {
  const html =
    "<table><tr><td>CC-MAIN-2013-20</td><td>May 2013</td><td>1.2</td><td>5</td></tr><tr><td><a>CC-MAIN-2026-34</a></td><td>August 2026</td><td>2.14</td><td>107.53</td></tr></table>";
  expect(parseCatalogue(html)).toEqual([
    {
      id: "CC-MAIN-2026-34",
      label: "August 2026",
      year: 2026,
      pages: 2140000000,
    },
    { id: "CC-MAIN-2013-20", label: "May 2013", year: 2013, pages: 1200000000 },
  ]);
});

test("reads only the WET file count and size", () => {
  expect(
    parseWetStats(
      "<tr><td>WARC</td><td>warc.paths.gz</td><td>999</td><td>107.53</td></tr><tr><td>WET</td><td><a>wet.paths.gz</a></td><td>100000</td><td>5.84</td></tr>",
    ),
  ).toEqual({ files: 100000, wetTiB: 5.84 });
});

test("fails clearly if the source table changes", () => {
  expect(() => parseCatalogue("Unavailable")).toThrow("missing");
  expect(() => parseWetStats("Unavailable")).toThrow("missing");
});
