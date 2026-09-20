/** Specify canonical links, hostile-route rejection, and accepted jump forms. */
import { expect, test } from "vitest";
import {
  filePath,
  fileUrl,
  parseFilePath,
  parseJump,
  parseRoute,
  routeHash,
} from "./urls.ts";

const file = {
  crawl: "CC-MAIN-2026-34",
  segment: "1786091384908.68",
  file: "20260807101845-20260807131845-00000",
};
const path =
  "crawl-data/CC-MAIN-2026-34/segments/1786091384908.68/wet/CC-MAIN-20260807101845-20260807131845-00000.warc.wet.gz";
const hash =
  "#/r/CC-MAIN-2026-34/1786091384908.68/20260807101845-20260807131845-00000/11692-1799";
const record = { kind: "record", file, offset: 11692, length: 1799 } as const;

test.each([
  ["843", { kind: "position", position: 843 }],
  ["00843", { kind: "position", position: 843 }],
  [" 00843 ", { kind: "position", position: 843 }],
  [
    "CC-MAIN-20260807101845-20260807131845-00000.warc.wet.gz",
    {
      kind: "filename",
      filename: "CC-MAIN-20260807101845-20260807131845-00000.warc.wet.gz",
    },
  ],
  [`https://data.commoncrawl.org/${path}`, { kind: "file", file }],
  [`s3://commoncrawl/${path}`, { kind: "file", file }],
  [path, { kind: "file", file }],
  [hash, record],
  [`https://example.org/wet-explorer/${hash}`, record],
])("normalizes jump form %s", (input, expected) =>
  expect(parseJump(input)).toEqual(expected),
);

test.each([
  "",
  "-1",
  "1.2",
  "1e3",
  "9007199254740992",
  `https://evil.test/${path}`,
  `https://data.commoncrawl.org.evil.test/${path}`,
  `s3://other/${path}`,
  "javascript:alert(1)",
])("rejects jump input %s", (input) => expect(parseJump(input)).toBeNull());

test("permanent links and file URLs round trip without a path list", () => {
  expect(parseRoute(hash)).toEqual(record);
  expect(routeHash(record)).toBe(hash);
  expect(filePath(file)).toBe(path);
  expect(fileUrl(file)).toBe(`https://data.commoncrawl.org/${path}`);
  expect(parseFilePath(path)).toEqual(file);
});

test.each([
  { kind: "home" },
  { kind: "crawl", crawl: file.crawl },
  { kind: "segment", crawl: file.crawl, segment: file.segment },
  { kind: "file", file },
  { kind: "file", file, from: 13491 },
] as const)("round trips route $kind", (route) =>
  expect(parseRoute(routeHash(route))).toEqual(route),
);

test.each([
  "#/c/../../evil.test",
  "#/c/CC-MAIN-2026-34/%2e%2e",
  "#/c/CC-MAIN-2026-34/<script>",
  hash.replace("11692-1799", "-1-1799"),
  hash.replace("11692-1799", "0-0"),
  hash.replace("11692-1799", "9007199254740992-1"),
  hash.replace("11692-1799", "9007199254740991-2"),
  `${hash}/ignored`,
  `${hash}?extra=1`,
  `#/f/${file.crawl}/${file.segment}/${file.file}?from=1&from=2`,
  `#/f/${file.crawl}/${file.segment}/${file.file}?from=Infinity`,
])("rejects hostile or malformed route %s", (input) =>
  expect(parseRoute(input)).toEqual({ kind: "invalid" }),
);

test("URL builders validate even if called without the router", () => {
  expect(() => fileUrl({ ...file, crawl: "../../evil.test" })).toThrow();
  expect(() => routeHash({ ...record, offset: -1 })).toThrow();
  expect(() => fileUrl({ ...file, file: `${file.file}\n` })).toThrow();
  expect(parseRoute(`${hash}\n`)).toEqual({ kind: "invalid" });
});
