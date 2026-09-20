/** Verify permanent-link reads with exact byte ranges and recorded content. */
import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { expect, test, vi } from "vitest";
import { fetchRecord } from "./direct.ts";

const bytes = new Uint8Array(
  readFileSync("tests/fixtures/real-head.warc.wet.gz"),
);
const reference = {
  file: {
    crawl: "CC-MAIN-2026-34",
    segment: "1786091384908.68",
    file: "20260807101845-20260807131845-00000",
  },
  offset: 11692,
  length: 1799,
};

/** Serve exactly the requested known member, with real HTTP range metadata. */
function memberResponse(data = bytes.subarray(11692, 13491)): Response {
  return new Response(data, {
    status: 206,
    headers: { "Content-Range": `bytes 11692-13490/${bytes.length}` },
  });
}

test("opens the known record using one exact request without fetching paths", async () => {
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    expect([...new Headers(init?.headers)]).toEqual([
      ["range", "bytes=11692-13490"],
    ]);
    return memberResponse();
  });
  const record = await fetchRecord(reference, {
    signal: new AbortController().signal,
    fetcher,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe(
    "https://data.commoncrawl.org/crawl-data/CC-MAIN-2026-34/segments/1786091384908.68/wet/CC-MAIN-20260807101845-20260807131845-00000.warc.wet.gz",
  );
  expect(record.meta).toMatchObject({
    index: null,
    offset: 11692,
    length: 1799,
    type: "conversion",
  });
  expect(Buffer.from(record.raw)).toEqual(
    gunzipSync(bytes.subarray(11692, 13491)),
  );
  expect(record.payload.length).toBe(record.meta.bytes);
});

test("a transient busy response retries the same exact member range", async () => {
  const fetcher = vi.fn(async () => memberResponse());
  fetcher.mockResolvedValueOnce(new Response("SlowDown", { status: 503 }));
  const events: string[] = [];
  const record = await fetchRecord(reference, {
    signal: new AbortController().signal,
    fetcher,
    retryDelays: [1],
    random: () => 0.5,
    onEvent: (event) => events.push(event.kind),
  });
  expect(record.meta.offset).toBe(11692);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(events).toContain("waiting");
});

test("rejects an invalid gzip or decoded non-WARC link with the specific link error", async () => {
  const compressed = gzipSync("This is not a WARC member.");
  const fetcher = async () =>
    new Response(compressed, {
      status: 206,
      headers: {
        "Content-Range": `bytes 0-${compressed.length - 1}/${compressed.length}`,
      },
    });
  await expect(
    fetchRecord(
      { ...reference, offset: 0, length: compressed.length },
      { signal: new AbortController().signal, fetcher },
    ),
  ).rejects.toMatchObject({ name: "InvalidRecordLinkError" });
});

test("a link extending beyond EOF is not accepted as a shorter record", async () => {
  const fetcher = async () =>
    new Response(bytes.subarray(11692), {
      status: 206,
      headers: {
        "Content-Range": `bytes 11692-${bytes.length - 1}/${bytes.length}`,
      },
    });
  await expect(
    fetchRecord(
      { ...reference, length: bytes.length },
      { signal: new AbortController().signal, fetcher },
    ),
  ).rejects.toMatchObject({ name: "InvalidRecordLinkError" });
});

test("validates offsets and file components before issuing a request", async () => {
  const fetcher = vi.fn();
  for (const value of [
    { ...reference, offset: -1 },
    { ...reference, length: 0 },
    { ...reference, length: Number.MAX_SAFE_INTEGER },
    { ...reference, file: { ...reference.file, segment: "../other" } },
  ]) {
    await expect(
      fetchRecord(value, { signal: new AbortController().signal, fetcher }),
    ).rejects.toThrow();
  }
  expect(fetcher).not.toHaveBeenCalled();
});

test("an already cancelled direct read issues no request", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn();
  await expect(
    fetchRecord(reference, { signal: controller.signal, fetcher }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).not.toHaveBeenCalled();
});

test("invalid compressed bytes produce a link error rather than a decoder exception", async () => {
  const fetcher = async () => memberResponse(new Uint8Array(reference.length));
  await expect(
    fetchRecord(reference, { signal: new AbortController().signal, fetcher }),
  ).rejects.toMatchObject({
    name: "InvalidRecordLinkError",
    message: "This link does not point to a record.",
  });
});
