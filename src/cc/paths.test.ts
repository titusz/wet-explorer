/** Resolve file positions and segments from a recorded crawl path list. */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test, vi } from "vitest";
import { fetchPaths, parsePaths, randomFile, resolveJump } from "./paths.ts";
import { parseJump } from "./urls.ts";

const crawl = "CC-MAIN-2026-34";
const compressed = new Uint8Array(
  readFileSync("tests/fixtures/paths-sample.gz"),
);
const text = gunzipSync(compressed).toString();

test("groups all 2,500 real paths while retaining their global positions", () => {
  const index = parsePaths(text, crawl);
  expect(index.files).toHaveLength(2500);
  expect([...index.segments.values()].map((files) => files.length)).toEqual([
    1000, 1000, 500,
  ]);
  const jump = parseJump("1000");
  if (!jump) throw new Error("Jump form was not recognized.");
  expect(resolveJump(jump, index)).toEqual({
    kind: "file",
    file: index.files[1000],
  });
  expect(index.files[1000]?.file).toBe("20260807103001-20260807133001-00000");
});

test("resolves bare numbers by line, filenames by exact match, and full links directly", () => {
  const index = parsePaths(text, crawl);
  for (const input of [
    "843",
    "00843",
    "CC-MAIN-20260807101845-20260807131845-00843.warc.wet.gz",
  ]) {
    const jump = parseJump(input);
    if (!jump) throw new Error("Jump form was not recognized.");
    expect(resolveJump(jump, index)).toEqual({
      kind: "file",
      file: index.files[843],
    });
  }
  expect(resolveJump({ kind: "position", position: 2500 }, index)).toBeNull();
  const file = index.files[0];
  if (!file) throw new Error("Empty fixture.");
  const direct = { kind: "record", file, offset: 11692, length: 1799 } as const;
  expect(resolveJump(direct, index)).toEqual(direct);
});

test("random selection weights individual files equally, including partial segments", () => {
  const index = parsePaths(text, crawl);
  expect(randomFile(index, () => 0)).toBe(index.files[0]);
  expect(randomFile(index, () => 0.5)).toBe(index.files[1250]);
  expect(randomFile(index, () => 0.999999)).toBe(index.files[2499]);
});

test("rejects an empty list, cross-crawl paths, and hostile paths", () => {
  expect(() => parsePaths("", crawl)).toThrow();
  expect(() => parsePaths(text, "CC-MAIN-2026-30")).toThrow();
  expect(() =>
    parsePaths(`${text}\nhttps://evil.test/file\n`, crawl),
  ).toThrow();
});

test("fetches and decompresses only the requested crawl's single-member path list", async () => {
  const fetcher = vi.fn(async () => new Response(compressed));
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  expect((await fetchPaths(crawl, signal)).files).toHaveLength(2500);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    `https://data.commoncrawl.org/crawl-data/${crawl}/wet.paths.gz`,
    { signal },
  );
});

test("validates the crawl before fetching and surfaces a recoverable list failure", async () => {
  const fetcher = vi.fn(async () => new Response("SlowDown", { status: 503 }));
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  await expect(fetchPaths("../../evil", signal)).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  await expect(fetchPaths(crawl, signal)).rejects.toThrow("503");
});
