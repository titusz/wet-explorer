/** Gate whole-file fallback on positive evidence of a range/CORS limitation. */
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createReadSession, readRanges } from "./bytesource.ts";
import { fetchRecord } from "./direct.ts";
import { type Member, MemberStream } from "./members.ts";

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

test("a successful HEAD after a failed range enables streaming GET once per session", async () => {
  const requests: string[] = [];
  const modes: string[] = [];
  const session = createReadSession((mode) => modes.push(mode));
  let cancelled = 0;
  let delivered = 0;
  const fetcher = async (
    _url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    const range = new Headers(init?.headers).get("Range");
    requests.push(range ? `Range: ${range}` : (init?.method ?? "GET"));
    if (range) throw new TypeError("Range request blocked by browser.");
    if (init?.method === "HEAD")
      return new Response(null, {
        headers: { "Content-Length": String(bytes.length) },
      });
    let offset = 0;
    return new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset === bytes.length) {
            controller.close();
            return;
          }
          const end = Math.min(bytes.length, offset + 4096);
          controller.enqueue(bytes.subarray(offset, end));
          delivered += end - offset;
          offset = end;
        },
        cancel() {
          cancelled++;
        },
      }),
      { headers: { "Content-Length": String(bytes.length) } },
    );
  };
  const events: string[] = [];
  const record = await fetchRecord(reference, {
    signal: new AbortController().signal,
    fetcher,
    session,
    onEvent: (event) => events.push(event.kind),
  });
  expect(record.meta.offset).toBe(11692);
  expect(record.meta.bytes).toBeGreaterThan(0);
  expect(requests).toEqual(["Range: bytes=11692-13490", "HEAD", "GET"]);
  expect(events).toContain("locating");
  expect(cancelled).toBe(1);
  expect(delivered).toBeLessThan(bytes.length);
  await fetchRecord(reference, {
    signal: new AbortController().signal,
    fetcher,
    session,
  });
  expect(requests.at(-1)).toBe("GET");
  expect(requests).toHaveLength(4);
  expect(modes).toEqual(["stream"]);
});

test("an offline HEAD does not authorize a whole-file GET or repeated probes", async () => {
  const session = createReadSession(() => {});
  const methods: string[] = [];
  const fetcher = async (
    _url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    methods.push(
      new Headers(init?.headers).has("Range")
        ? "RANGE"
        : (init?.method ?? "GET"),
    );
    throw new TypeError("Offline");
  };
  const options = {
    signal: new AbortController().signal,
    fetcher,
    session,
    retryDelays: [],
  };
  await expect(fetchRecord(reference, options)).rejects.toMatchObject({
    name: "InterruptedError",
  });
  await expect(fetchRecord(reference, options)).rejects.toMatchObject({
    name: "InterruptedError",
  });
  expect(methods).toEqual(["RANGE", "HEAD", "RANGE"]);
});

test.each([503, 200])(
  "HTTP %s never triggers the compatibility GET",
  async (status) => {
    const methods: string[] = [];
    const fetcher = async (_url: string, init?: RequestInit) => {
      methods.push(
        new Headers(init?.headers).has("Range")
          ? "RANGE"
          : (init?.method ?? "GET"),
      );
      return new Response("Not a valid range", { status });
    };
    await expect(
      fetchRecord(reference, {
        signal: new AbortController().signal,
        session: createReadSession(() => {}),
        fetcher,
        retryDelays: [],
      }),
    ).rejects.toThrow();
    expect(methods).toEqual(["RANGE"]);
  },
);

test("after a successful range, a network outage stays on the ranged retry path", async () => {
  const session = createReadSession(() => {});
  const methods: string[] = [];
  const fetcher = async (
    _url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    methods.push(
      new Headers(init?.headers).has("Range")
        ? "RANGE"
        : (init?.method ?? "GET"),
    );
    if (methods.length > 1) throw new TypeError("Temporary network outage");
    return new Response(bytes.subarray(11692, 13491), {
      status: 206,
      headers: { "Content-Range": `bytes 11692-13490/${bytes.length}` },
    });
  };
  const options = {
    signal: new AbortController().signal,
    session,
    fetcher,
    retryDelays: [],
  };
  await fetchRecord(reference, options);
  await expect(fetchRecord(reference, options)).rejects.toMatchObject({
    name: "InterruptedError",
  });
  expect(methods).toEqual(["RANGE", "RANGE"]);
});

test("cancellation while probing does not start the fallback GET", async () => {
  const controller = new AbortController();
  const methods: string[] = [];
  const fetcher = async (
    _url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    const ranged = new Headers(init?.headers).has("Range");
    methods.push(ranged ? "RANGE" : (init?.method ?? "GET"));
    if (ranged) throw new TypeError("Blocked range");
    controller.abort();
    return new Response(null);
  };
  await expect(
    fetchRecord(reference, {
      signal: controller.signal,
      session: createReadSession(() => {}),
      fetcher,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(methods).toEqual(["RANGE", "HEAD"]);
});

test("a compatibility stream can resume at a member offset without Content-Length", async () => {
  const session = createReadSession(() => {});
  const records: Member[] = [];
  let decoder = new MemberStream(13491, (member) => records.push(member));
  let complete: number | null = null;
  const fetcher = async (
    _url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    if (new Headers(init?.headers).has("Range"))
      throw new TypeError("Blocked range");
    return new Response(init?.method === "HEAD" ? null : bytes);
  };
  for await (const event of readRanges(
    "https://data.commoncrawl.org/fixture.warc.wet.gz",
    {
      start: 13491,
      signal: new AbortController().signal,
      safeOffset: () => decoder.safeOffset,
      fetcher,
      session,
    },
  )) {
    if (event.kind === "restart")
      decoder = new MemberStream(event.offset, (member) =>
        records.push(member),
      );
    if (event.kind === "chunk") {
      expect(event.total).toBeNull();
      decoder.push(event.data);
    }
    if (event.kind === "complete") {
      complete = event.total;
      decoder.finish();
    }
  }
  expect(complete).toBe(bytes.length);
  expect(records).toHaveLength(47);
  expect(records[0]?.offset).toBe(13491);
  expect(records.reduce((sum, record) => sum + record.length, 13491)).toBe(
    bytes.length,
  );
});
