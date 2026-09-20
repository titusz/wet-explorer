/** Verify Chromium's Linux footprint definition separately from resident mappings. */
import { expect, test } from "vitest";
import { linuxMemoryCounters } from "./linux-memory.ts";

// Status fields recorded on Ubuntu 24.04; synthetic mappings distinguish file-backed pages.
const status =
  "VmRSS:\t    1072 kB\nRssAnon:\t      96 kB\nVmSwap:\t       0 kB\n";
const mappings =
  "Rss:                1072 kB\nPrivate_Clean:       128 kB\nPrivate_Dirty:        96 kB\n";

test("uses anonymous memory plus swap and reports file-backed private mappings separately", () => {
  expect(linuxMemoryCounters(status, mappings)).toEqual({
    residentBytes: 1072 * 1024,
    privateBytes: 96 * 1024,
    privateMappingBytes: 224 * 1024,
  });
  expect(
    linuxMemoryCounters(status.replace("0 kB", "32 kB"), mappings).privateBytes,
  ).toBe(128 * 1024);
});

test("requires every counter instead of treating missing or malformed readings as zero", () => {
  for (const field of ["RssAnon", "VmSwap"])
    expect(() =>
      linuxMemoryCounters(status.replace(field, "Missing"), mappings),
    ).toThrow(field);
  for (const field of ["Rss", "Private_Clean", "Private_Dirty"])
    expect(() =>
      linuxMemoryCounters(status, mappings.replace(field, "Missing")),
    ).toThrow(field);
  expect(() =>
    linuxMemoryCounters(status.replace("96 kB", "-1 kB"), mappings),
  ).toThrow("RssAnon");
});
