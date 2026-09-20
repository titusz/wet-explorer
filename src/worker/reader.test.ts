/** Exercise the production reader inside a worker with recorded HTTP responses. */
import { expect, test } from "vitest";
import { ReaderHarness } from "../../tests/reader-harness.ts";
import type { RecordMeta } from "../cc/record.ts";
import { PAYLOAD_BUDGET } from "./payload-cache.ts";

const file = {
  crawl: "CC-MAIN-2026-34",
  segment: "1786091384908.68",
  file: "20260807101845-20260807131845-00000",
};

test("read-ahead stops at 200 unseen rows and each frame credit yields at most 100", async () => {
  const worker = new ReaderHarness("synthetic-20k.warc.wet.gz");
  try {
    await worker.wait("ready");
    worker.send({ type: "open", streamId: 1, file });
    const paused = await worker.wait(
      "state",
      (event) => event.state === "paused",
    );
    expect(paused.progress.rows).toBe(200);
    expect(paused.progress.totalRecords).toBeUndefined();
    expect(worker.events.filter((event) => event.type === "rows")).toHaveLength(
      0,
    );
    worker.send({ type: "flush", streamId: 1 });
    const first = await worker.wait("rows");
    expect(first.rows).toHaveLength(100);
    expect(first.more).toBe(true);
    expect(first.rows[0]?.type).toBe("conversion");
    worker.send({ type: "flush", streamId: 1 });
    await worker.wait("rows", (event) => !event.more);
    worker.send({ type: "visible", streamId: 1, index: 199 });
    const resumed = await worker.wait(
      "state",
      (event) => event.state === "paused" && event.progress.rows > 200,
    );
    expect(resumed.progress.rows).toBe(400);
    worker.send({ type: "inspect", id: 1 });
    const stats = await worker.wait("inspection");
    expect(stats.peak).toBe(1);
    expect(stats.active).toBe(0);
    expect(stats.requests[1]?.range).toBe(
      `bytes=${paused.progress.safeOffset}-4194303`,
    );
  } finally {
    await worker.close();
  }
});

test("EOF publishes a total and cached selection requires no additional request", async () => {
  const worker = new ReaderHarness("real-head.warc.wet.gz");
  try {
    await worker.wait("ready");
    worker.send({ type: "open", streamId: 2, file });
    const complete = await worker.wait(
      "state",
      (event) => event.state === "complete",
    );
    expect(complete.progress.totalRecords).toBe(49);
    expect(complete.progress.bytesRead).toBe(complete.progress.size);
    worker.send({
      type: "fetchRecord",
      requestId: 5,
      file,
      offset: 11692,
      length: 1799,
    });
    const selected = await worker.wait("record");
    expect(selected.record.meta.index).toBe(2);
    expect(selected.record.rawText).toMatch(/^WARC\/1\.0/);
    worker.send({ type: "inspect", id: 2 });
    const stats = await worker.wait("inspection");
    expect(stats.requests).toHaveLength(1);
    expect(stats.peak).toBe(1);
  } finally {
    await worker.close();
  }
});

test("throttling interrupts after retries and user continuation keeps received rows", async () => {
  const worker = new ReaderHarness("real-head.warc.wet.gz", { busy: 3 });
  try {
    await worker.wait("ready");
    worker.send({ type: "open", streamId: 3, file });
    await worker.wait("state", (event) => event.state === "interrupted");
    expect(
      worker.events.some(
        (event) =>
          event.type === "progress" && event.progress.countdown !== null,
      ),
    ).toBe(true);
    worker.send({ type: "continue", streamId: 3 });
    const complete = await worker.wait(
      "state",
      (event) => event.state === "complete",
    );
    expect(complete.progress.totalRecords).toBe(49);
  } finally {
    await worker.close();
  }
});

test("rapid navigation cancels the previous file before opening another request", async () => {
  const worker = new ReaderHarness("real-head.warc.wet.gz", { latency: 50 });
  try {
    await worker.wait("ready");
    worker.send({ type: "open", streamId: 4, file });
    worker.send({
      type: "open",
      streamId: 5,
      file: { ...file, file: "20260807101845-20260807131845-00001" },
    });
    await worker.wait(
      "state",
      (event) => event.streamId === 5 && event.state === "complete",
    );
    worker.send({ type: "inspect", id: 3 });
    expect((await worker.wait("inspection")).peak).toBe(1);
    expect(
      worker.events.some(
        (event) => event.type === "rowsAvailable" && event.streamId === 4,
      ),
    ).toBe(false);
  } finally {
    await worker.close();
  }
});

test("a forward read reaches EOF without claiming the unseen file's total", async () => {
  const worker = new ReaderHarness("real-head.warc.wet.gz");
  try {
    await worker.wait("ready");
    worker.send({ type: "open", streamId: 6, file, start: 13491 });
    const end = await worker.wait(
      "state",
      (event) => event.state === "complete",
    );
    expect(end.progress.rows).toBe(47);
    expect(end.progress.totalRecords).toBeUndefined();
    worker.send({ type: "flush", streamId: 6 });
    expect(
      (await worker.wait("rows")).rows.every((row) => row.index === null),
    ).toBe(true);
  } finally {
    await worker.close();
  }
});

test("all 20,000 records survive resume boundaries while evicted payloads refetch exactly", async () => {
  const worker = new ReaderHarness("synthetic-20k.warc.wet.gz");
  const rows: RecordMeta[] = [];
  try {
    await worker.wait("ready");
    worker.send({ type: "open", streamId: 7, file });
    for (let count = 200; count <= 20000; count += 200) {
      await worker.wait(
        "state",
        (event) =>
          (event.state === "paused" || event.state === "complete") &&
          event.progress.rows === count,
      );
      for (let batch = 0; batch < 2; batch++) {
        worker.send({ type: "flush", streamId: 7 });
        const next = await worker.wait(
          "rows",
          (event) => event.rows[0]?.index === rows.length + 1,
        );
        rows.push(...next.rows);
      }
      worker.send({ type: "continue", streamId: 7 });
    }
    const complete = await worker.wait(
      "state",
      (event) => event.state === "complete",
    );
    expect(complete.progress.totalRecords).toBe(20000);
    expect(new Set(rows.map((row) => row.offset)).size).toBe(20000);
    expect(rows.every((row, index) => row.index === index + 1)).toBe(true);
    worker.send({ type: "inspect", id: 7 });
    const before = await worker.wait("inspection", (event) => event.id === 7);
    expect(before.cacheBytes).toBeLessThanOrEqual(PAYLOAD_BUDGET);
    expect(before.cacheBytes).toBeGreaterThan(PAYLOAD_BUDGET - 8192);
    const first = rows[0];
    if (!first) throw new Error("Missing fixture row");
    worker.send({
      type: "fetchRecord",
      requestId: 7,
      file,
      offset: first.offset,
      length: first.length,
    });
    const selected = await worker.wait(
      "record",
      (event) => event.requestId === 7,
    );
    expect(selected.record.meta).toEqual(first);
    worker.send({ type: "inspect", id: 8 });
    const after = await worker.wait("inspection", (event) => event.id === 8);
    expect(after.requests).toHaveLength(before.requests.length + 1);
    expect(after.requests.at(-1)?.range).toBe(
      `bytes=${first.offset}-${first.offset + first.length - 1}`,
    );
    expect(after.peak).toBe(1);
    expect(after.active).toBe(0);
  } finally {
    await worker.close();
  }
}, 20000);

test("scrolling during a direct fetch waits for selection and manual pause cancels queued resume", async () => {
  const worker = new ReaderHarness("synthetic-20k.warc.wet.gz", {
    latency: 30,
  });
  try {
    await worker.wait("ready");
    worker.send({ type: "open", streamId: 8, file });
    const paused = await worker.wait(
      "state",
      (event) => event.state === "paused",
    );
    worker.send({
      type: "fetchRecord",
      requestId: 8,
      file,
      offset: 0,
      length: 1,
    });
    worker.send({ type: "visible", streamId: 8, index: 199 });
    worker.send({ type: "pause", streamId: 8 });
    await worker.wait(
      "error",
      (event) => event.scope === "record" && event.id === 8,
    );
    worker.send({ type: "inspect", id: 9 });
    const stats = await worker.wait("inspection", (event) => event.id === 9);
    expect(stats.requests).toHaveLength(2);
    expect(stats.peak).toBe(1);
    expect(
      worker.events.filter(
        (event) =>
          event.type === "state" && event.progress.rows > paused.progress.rows,
      ),
    ).toHaveLength(0);
  } finally {
    await worker.close();
  }
});

test("first rows arrive within one second at 10 Mbit/s and progress remains live", async () => {
  const worker = new ReaderHarness("synthetic-20k.warc.wet.gz", {
    bandwidth: 1250000,
    latency: 450,
  });
  try {
    await worker.wait("ready");
    const start = performance.now();
    worker.send({ type: "open", streamId: 9, file });
    await worker.wait("rowsAvailable");
    expect(performance.now() - start).toBeLessThan(1000);
    await worker.wait("state", (event) => event.state === "paused");
    const ticks = worker.events.filter((event) => event.type === "progress");
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    const times = worker.arrivals
      .filter(
        ({ event }) => event.type === "progress" || event.type === "state",
      )
      .map(({ time }) => time);
    for (let index = 1; index < times.length; index++)
      expect((times[index] ?? 0) - (times[index - 1] ?? 0)).toBeLessThanOrEqual(
        400,
      );
  } finally {
    await worker.close();
  }
});
