/** Check scoped filtering and summaries with the multilingual recorded edge cases. */
import { expect, test } from "vitest";
import { fixtureRecords } from "../../tests/records.ts";
import { emptyFilters, filterRows, summarizeRows } from "./filters.ts";

const rows = fixtureRecords()
  .map((record) => record.meta)
  .filter((meta) => meta.type !== "warcinfo");

test("short and language-unknown records remain present until explicitly filtered", () => {
  expect(filterRows(rows, emptyFilters())).toBe(rows);
  const short = rows.filter((row) => row.short);
  expect(short.length).toBeGreaterThan(0);
  expect(filterRows(rows, { ...emptyFilters(), hideShort: true })).toEqual(
    rows.filter((row) => !row.short),
  );
  expect(filterRows(rows, { ...emptyFilters(), language: "unknown" })).toEqual(
    rows.filter((row) => !row.languages.length),
  );
});

test("text is case-insensitive and limited to title or host, with all filters combined", () => {
  const row = rows.find((row) => row.languages.includes("ara"));
  if (!row?.host) throw new Error("Missing Arabic fixture");
  expect(
    filterRows(rows, {
      text: row.host.toUpperCase(),
      language: "ara",
      hideShort: false,
    }),
  ).toContain(row);
  expect(
    filterRows(rows, {
      text: "a term absent from every title and host",
      language: "",
      hideShort: false,
    }),
  ).toEqual([]);
  expect(
    filterRows(rows, {
      text: row.host,
      language: "fra",
      hideShort: true,
    }).every((row) => row.languages.includes("fra") && !row.short),
  ).toBe(true);
});

test("summaries count each record once and retain a bounded language list", () => {
  const summary = summarizeRows(rows);
  expect(summary.records).toBe(rows.length);
  expect(summary.short).toBe(rows.filter((row) => row.short).length);
  expect(summary.languages.length).toBeLessThanOrEqual(3);
  expect(
    summary.languages.every(
      ([code, count]) =>
        count ===
        rows.filter((row) => (row.languages[0] ?? "unknown") === code).length,
    ),
  ).toBe(true);
  expect(summarizeRows([])).toEqual({ records: 0, short: 0, languages: [] });
});
