/** Exercise range streaming and recovery without any network access. */
import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { InterruptedError, readRanges } from "./bytesource.ts";
import { type Member, MemberStream } from "./members.ts";

const bytes = new Uint8Array(
  readFileSync("tests/fixtures/real-head.warc.wet.gz"),
);
const url = "https://data.commoncrawl.org/fixture.warc.wet.gz";

/** Serve a standards-shaped range with arbitrarily sized body chunks. */
function response(start: number, end: number, data = bytes): Response {
  const last = Math.min(end, data.length - 1);
  const chunks = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = start; offset <= last; offset += 8192)
        controller.enqueue(
          data.subarray(offset, Math.min(last + 1, offset + 8192)),
        );
      controller.close();
    },
  });
  return new Response(chunks, {
    status: 206,
    headers: {
      "Content-Range": `bytes ${start}-${last}/${data.length}`,
      "Content-Length": String(last - start + 1),
    },
  });
}

/** Parse the only custom request header the host accepts without preflight. */
function requested(init?: RequestInit): [number, number] {
  const headers = new Headers(init?.headers);
  expect([...headers.keys()]).toEqual(["range"]);
  const match = /^bytes=(\d+)-(\d+)$/.exec(headers.get("Range") ?? "");
  if (!match) throw new Error("Request did not have a bounded single range.");
  return [Number(match[1]), Number(match[2])];
}

test("streams chunks before range completion and uses the fixed 4 MiB grid", async () => {
  const large = new Uint8Array(9 * 1024 * 1024);
  const ranges: [number, number][] = [];
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const range = requested(init);
    ranges.push(range);
    return response(...range, large);
  });
  let chunks = 0;
  for await (const event of readRanges(url, {
    start: 123,
    signal: new AbortController().signal,
    safeOffset: () => 123,
    fetcher,
  })) {
    if (event.kind === "chunk") {
      chunks++;
      if (chunks === 1) expect(fetcher).toHaveBeenCalledTimes(1);
    }
  }
  expect(ranges).toEqual([
    [123, 4194303],
    [4194304, 8388607],
    [8388608, 12582911],
  ]);
  expect(chunks).toBeGreaterThan(100);
});

test.each([64000000, 64 * 1024 * 1024])(
  "an uninterrupted %i-byte file uses at most 17 sequential bounded requests",
  async (size) => {
    const data = new Uint8Array(size);
    const ranges: [number, number][] = [];
    let delivered = 0;
    let completed = false;
    const fetcher = async (_url: string, init?: RequestInit) => {
      const range = requested(init);
      // Each response is consumed before the next range starts.
      expect(delivered).toBe(range[0]);
      ranges.push(range);
      return response(...range, data);
    };
    for await (const event of readRanges(url, {
      start: 0,
      signal: new AbortController().signal,
      safeOffset: () => delivered,
      fetcher,
    })) {
      if (event.kind === "chunk") delivered += event.data.length;
      if (event.kind === "complete") completed = true;
    }
    expect(completed).toBe(true);
    expect(delivered).toBe(size);
    expect(ranges).toEqual(
      Array.from({ length: Math.ceil(size / 4194304) }, (_, index) => [
        index * 4194304,
        (index + 1) * 4194304 - 1,
      ]),
    );
    expect(ranges.length).toBeLessThanOrEqual(17);
  },
);

test.each(["503", "drop", "stall"])(
  "recovers from %s with no gaps or duplicate members",
  async (failure) => {
    const records: Member[] = [];
    let decoder = new MemberStream(0, (member) => records.push(member));
    const ranges: number[] = [];
    let calls = 0;
    const fetcher = async (
      _url: string,
      init?: RequestInit,
    ): Promise<Response> => {
      const [start, end] = requested(init);
      ranges.push(start);
      calls++;
      if (calls > 1) return response(start, end);
      if (failure === "503")
        return new Response("<Code>SlowDown</Code>", { status: 503 });
      let pulls = 0;
      return new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (pulls++ === 0) controller.enqueue(bytes.subarray(0, 15000));
            else if (failure === "drop")
              controller.error(new TypeError("Connection dropped"));
          },
        }),
        {
          status: 206,
          headers: {
            "Content-Range": `bytes 0-${bytes.length - 1}/${bytes.length}`,
          },
        },
      );
    };
    const waits: number[] = [];
    for await (const event of readRanges(url, {
      start: 0,
      signal: new AbortController().signal,
      safeOffset: () => decoder.safeOffset,
      fetcher,
      stallMs: 5,
      retryDelays: [1],
      random: () => 0.5,
    })) {
      if (event.kind === "restart")
        decoder = new MemberStream(event.offset, (member) =>
          records.push(member),
        );
      if (event.kind === "chunk") decoder.push(event.data);
      if (event.kind === "waiting") waits.push(event.seconds);
      if (event.kind === "complete") decoder.finish();
    }
    expect(waits).toContain(1);
    expect(records).toHaveLength(50);
    expect(new Set(records.map((record) => record.offset)).size).toBe(50);
    expect(records.reduce((sum, record) => sum + record.length, 0)).toBe(
      bytes.length,
    );
    expect(ranges).toEqual([0, failure === "503" ? 0 : 13491]);
  },
);

test("exhausted retries publish interrupted with the safe resume position", async () => {
  const fetcher = vi.fn(async () => new Response("SlowDown", { status: 503 }));
  const run = async () => {
    for await (const _event of readRanges(url, {
      start: 423,
      safeOffset: () => 423,
      signal: new AbortController().signal,
      fetcher,
      retryDelays: [1, 1],
      random: () => 0.5,
    })) {
      /* Drain the stream. */
    }
  };
  await expect(run()).rejects.toMatchObject({
    name: "InterruptedError",
    offset: 423,
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(new InterruptedError(423)).toBeInstanceOf(Error);
});

test("abort during a waiting body promptly cancels the request", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const fetcher = async () =>
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 206, headers: { "Content-Range": "bytes 0-99/100" } },
    );
  const iterator = readRanges(url, {
    start: 0,
    safeOffset: () => 0,
    signal: controller.signal,
    fetcher,
  });
  await iterator.next();
  const pending = iterator.next();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(cancelled).toBe(true);
});

test("rejects a server that ignores Range without consuming the entire file", async () => {
  const fetcher = async () => new Response(bytes, { status: 200 });
  const run = async () => {
    for await (const _event of readRanges(url, {
      start: 0,
      safeOffset: () => 0,
      signal: new AbortController().signal,
      fetcher,
    })) {
      /* Drain. */
    }
  };
  await expect(run()).rejects.toThrow("206");
});

test("replaying a grid range without completing a member does not reset the failure budget", async () => {
  const large = new Uint8Array(5 * 1024 * 1024);
  let requests = 0;
  const fetcher = async (
    _url: string,
    init?: RequestInit,
  ): Promise<Response> => {
    if (++requests > 6) throw new Error("Unbounded replay detected.");
    const [start, end] = requested(init);
    return start === 0
      ? response(start, end, large)
      : new Response("SlowDown", { status: 503 });
  };
  const run = async () => {
    for await (const _event of readRanges(url, {
      start: 0,
      safeOffset: () => 0,
      signal: new AbortController().signal,
      fetcher,
      retryDelays: [1],
      random: () => 0.5,
    })) {
      /* No complete member in the successful first range. */
    }
  };
  await expect(run()).rejects.toBeInstanceOf(InterruptedError);
  expect(requests).toBe(4);
});

test("empty body chunks do not reset the no-bytes stall deadline", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let timer: ReturnType<typeof setInterval> | undefined;
  let failure: unknown;
  const fetcher = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          timer = setInterval(() => stream.enqueue(new Uint8Array()), 1);
        },
        cancel() {
          clearInterval(timer);
        },
      }),
      { status: 206, headers: { "Content-Range": "bytes 0-99/100" } },
    );
  const iterator = readRanges(url, {
    start: 0,
    safeOffset: () => 0,
    signal: controller.signal,
    fetcher,
    stallMs: 5,
    retryDelays: [],
  });
  await iterator.next();
  const pending = iterator.next().catch((error: unknown) => {
    failure = error;
  });
  try {
    await vi.advanceTimersByTimeAsync(20);
    expect(failure).toBeInstanceOf(InterruptedError);
  } finally {
    controller.abort();
    await pending;
    clearInterval(timer);
    vi.useRealTimers();
  }
});
