/** Verify frame backpressure and navigation identity independently of browser timing. */

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, test } from "vitest";
import { fixtureRecords } from "../../tests/records.ts";
import { parsePaths } from "../cc/paths.ts";
import type { ReaderCommand, ReaderEvent } from "../worker/protocol.ts";
import { Controller, type ReaderPort } from "./controller.ts";
import { Store } from "./store.ts";

const file = {
  crawl: "CC-MAIN-2026-34",
  segment: "1786091384908.68",
  file: "20260807101845-20260807131845-00000",
};

/** Expose deterministic frame ticks and the commands sent by a real controller. */
function harness() {
  const commands: ReaderCommand[] = [];
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0;
  const port: ReaderPort = {
    postMessage: (command) => commands.push(command),
    onmessage: null,
    terminate: () => {},
  };
  const store = new Store();
  const controller = new Controller(store, port, {
    request: (callback) => {
      callbacks.set(++id, callback);
      return id;
    },
    cancel: (id) => {
      callbacks.delete(id);
    },
  });
  return {
    controller,
    store,
    commands,
    callbacks,
    emit: (event: ReaderEvent) =>
      port.onmessage?.(new MessageEvent("message", { data: event })),
  };
}

/** Run callbacks eligible for this frame, leaving newly scheduled callbacks pending. */
function tick(callbacks: Map<number, FrameRequestCallback>): void {
  const pending = [...callbacks.values()];
  callbacks.clear();
  for (const callback of pending) callback(0);
}

test("only one batch credit can be issued per frame and outstanding request", () => {
  const app = harness();
  app.controller.navigate({ kind: "file", file });
  app.emit({ type: "rowsAvailable", streamId: 1 });
  app.emit({ type: "rowsAvailable", streamId: 1 });
  expect(app.commands).toHaveLength(1);
  tick(app.callbacks);
  expect(
    app.commands.filter((command) => command.type === "flush"),
  ).toHaveLength(1);
  app.emit({ type: "rowsAvailable", streamId: 1 });
  tick(app.callbacks);
  expect(app.commands).toHaveLength(2);
  app.emit({ type: "rows", streamId: 1, rows: [], more: true });
  expect(app.commands).toHaveLength(2);
  tick(app.callbacks);
  expect(app.commands).toHaveLength(3);
});

test("navigation cancels frame credits and discards previous-file events", () => {
  const app = harness();
  app.controller.navigate({ kind: "file", file });
  app.emit({ type: "rowsAvailable", streamId: 1 });
  app.controller.navigate({
    kind: "file",
    file: { ...file, file: "20260807101845-20260807131845-00001" },
  });
  app.emit({ type: "rowsAvailable", streamId: 1 });
  tick(app.callbacks);
  expect(
    app.commands.filter((command) => command.type === "flush"),
  ).toHaveLength(0);
  expect(app.store.state.stream?.id).toBe(2);
});

test("opening a record in the current file retains the list and stream identity", () => {
  const app = harness();
  app.controller.navigate({ kind: "file", file });
  app.controller.navigate({
    kind: "record",
    file,
    offset: 11692,
    length: 1799,
  });
  expect(app.store.state.stream?.id).toBe(1);
  expect(app.commands.map((command) => command.type)).toEqual([
    "open",
    "fetchRecord",
  ]);
  app.controller.navigate({ kind: "file", file });
  expect(app.store.state.selection).toBeNull();
  expect(app.commands).toHaveLength(2);
  app.controller.navigate({ kind: "home" });
  expect(app.store.state.stream).toBeNull();
  expect(app.commands.at(-1)?.type).toBe("stop");
});

test("previous and next choose adjacent known records, including muted short rows", () => {
  const app = harness();
  const records = fixtureRecords().filter(
    (record) => record.meta.type !== "warcinfo",
  );
  const first = records[0];
  const next = records[1];
  if (!first || !next) throw new Error("Missing fixture records");
  app.controller.navigate({ kind: "file", file });
  app.emit({
    type: "rows",
    streamId: 1,
    rows: records.map((record) => record.meta),
    more: false,
  });
  app.controller.navigate({
    kind: "record",
    file,
    offset: first.meta.offset,
    length: first.meta.length,
  });
  app.emit({ type: "record", requestId: 2, record: first });
  expect(app.controller.canStep(-1)).toBe(false);
  app.controller.step(1);
  expect(app.store.state.route).toEqual({
    kind: "record",
    file,
    offset: next.meta.offset,
    length: next.meta.length,
  });
  app.emit({ type: "record", requestId: 3, record: next });
  app.controller.step(-1);
  expect(app.store.state.route).toEqual({
    kind: "record",
    file,
    offset: first.meta.offset,
    length: first.meta.length,
  });
});

test("next from a standalone link reads forward and waits for a complete next row", () => {
  const app = harness();
  const records = fixtureRecords("real-head.warc.wet.gz");
  const current = records[2];
  const next = records[3];
  if (!current || !next) throw new Error("Missing fixture records");
  app.controller.navigate({
    kind: "record",
    file,
    offset: current.meta.offset,
    length: current.meta.length,
  });
  app.emit({ type: "record", requestId: 1, record: current });
  app.controller.step(1);
  expect(app.commands.at(-1)).toEqual({
    type: "open",
    streamId: 2,
    file,
    start: 13491,
  });
  expect(app.store.state.selection?.waitingNext).toBe(true);
  app.emit({
    type: "rows",
    streamId: 2,
    rows: [{ ...next.meta, index: null }],
    more: false,
  });
  expect(app.store.state.route).toEqual({
    kind: "record",
    file,
    offset: next.meta.offset,
    length: next.meta.length,
  });
  app.emit({ type: "record", requestId: 3, record: next });
  expect(app.controller.canStep(-1)).toBe(false);
});

test("known EOF disables Next without another request, and record progress survives selection", () => {
  const app = harness();
  const last = fixtureRecords("real-head.warc.wet.gz").at(-1);
  if (!last) throw new Error("Missing fixture record");
  app.controller.navigate({
    kind: "record",
    file,
    offset: last.meta.offset,
    length: last.meta.length,
  });
  app.emit({
    type: "recordProgress",
    requestId: 1,
    locating: false,
    bytesRead: 150185,
    size: 150185,
    countdown: null,
  });
  app.emit({ type: "record", requestId: 1, record: last });
  const requests = app.commands.length;
  expect(app.store.state.selection?.progress?.size).toBe(150185);
  expect(app.controller.canStep(1)).toBe(false);
  app.controller.step(1);
  expect(app.commands).toHaveLength(requests);
});

/** Read the recorded manifest for real segment and global-position navigation cases. */
function manifest() {
  return parsePaths(
    gunzipSync(
      readFileSync(
        new URL("../../tests/fixtures/paths-sample.gz", import.meta.url),
      ),
    ).toString(),
    file.crawl,
  );
}

test("intent prefetch is deduplicated and survives opening the segment picker", () => {
  const app = harness();
  app.controller.ensurePaths(file.crawl);
  app.controller.ensurePaths(file.crawl);
  app.controller.navigate({ kind: "crawl", crawl: file.crawl });
  expect(app.commands).toEqual([
    { type: "paths", requestId: 1, crawl: file.crawl },
  ]);
  const paths = manifest();
  app.emit({ type: "paths", requestId: 1, paths });
  app.controller.navigate({
    kind: "segment",
    crawl: file.crawl,
    segment: file.segment,
  });
  expect(app.store.state.paths.get(file.crawl)).toEqual({
    status: "ready",
    index: paths,
  });
  expect(
    app.commands.filter((command) => command.type === "paths"),
  ).toHaveLength(1);
});

test("jump uses the manifest's global position and direct links need no manifest", () => {
  const app = harness();
  const paths = manifest();
  app.controller.jump("01843", file.crawl);
  expect(app.store.state.intent?.pending).toBe(true);
  app.emit({ type: "paths", requestId: 1, paths });
  expect(app.store.state.route).toEqual({
    kind: "file",
    file: paths.files[1843],
  });
  expect(app.commands.at(-1)?.type).toBe("open");
  const direct = harness();
  direct.controller.jump(
    `https://example.org/#/r/${file.crawl}/${file.segment}/${file.file}/11692-1799`,
  );
  expect(direct.commands.map((command) => command.type)).toEqual([
    "stop",
    "fetchRecord",
  ]);
});

test("random file waits for the chosen crawl and does not prefetch another file", () => {
  const app = harness();
  const paths = manifest();
  app.controller.random(file.crawl);
  app.emit({ type: "paths", requestId: 1, paths });
  const route = app.store.state.route;
  expect(route.kind).toBe("file");
  if (route.kind !== "file") throw new Error("No random selection");
  expect(paths.files).toContain(route.file);
  expect(app.commands.map((command) => command.type)).toEqual([
    "paths",
    "open",
  ]);
});

test("canceled manifest loads can restart and stale actions never change the route", () => {
  const app = harness();
  app.controller.random(file.crawl);
  app.controller.navigate({ kind: "home" });
  expect(app.store.state.paths.has(file.crawl)).toBe(false);
  app.emit({ type: "paths", requestId: 1, paths: manifest() });
  expect(app.store.state.route.kind).toBe("home");
  app.controller.ensurePaths(file.crawl);
  expect(app.commands.at(-1)).toEqual({
    type: "paths",
    requestId: 2,
    crawl: file.crawl,
  });
});

test("manifest errors keep a retry path and invalid or missing jumps stay local", () => {
  const app = harness();
  app.controller.jump("bad reference");
  expect(app.commands).toHaveLength(0);
  expect(app.store.state.intent?.error).toContain("not understood");
  app.controller.random(file.crawl);
  app.emit({ type: "error", scope: "paths", id: 1, code: "unavailable" });
  expect(app.store.state.intent?.pending).toBe(false);
  expect(app.store.state.paths.get(file.crawl)?.status).toBe("error");
  app.controller.jump("99999");
  app.emit({ type: "paths", requestId: 2, paths: manifest() });
  expect(app.store.state.intent?.error).toContain("No file");
  expect(app.store.state.route.kind).toBe("home");
});

test("Next file follows manifest order and stays recoverable at its end", () => {
  const app = harness();
  const paths = manifest();
  const current = paths.files[999];
  const last = paths.files.at(-1);
  if (!current || !last) throw new Error("Missing manifest records");
  app.controller.nextFile(current);
  app.emit({ type: "paths", requestId: 1, paths });
  expect(app.store.state.route).toEqual({
    kind: "file",
    file: paths.files[1000],
  });
  app.controller.nextFile(last);
  expect(app.store.state.intent?.error).toContain("no next file");
  app.controller.nextFile({
    ...file,
    file: "20260807101845-20260807131845-99999",
  });
  expect(app.store.state.intent?.error).toContain("no next file");
});

test("return state records the visible row's safe position and local byte progress", () => {
  const app = harness();
  const rows = fixtureRecords("real-head.warc.wet.gz")
    .filter((record) => record.meta.type !== "warcinfo")
    .map((record) => record.meta);
  app.controller.navigate({ kind: "file", file });
  app.emit({ type: "rows", streamId: 1, rows, more: false });
  app.emit({
    type: "progress",
    streamId: 1,
    progress: {
      bytesRead: 150185,
      size: 150185,
      rows: rows.length,
      safeOffset: 150185,
      countdown: null,
    },
  });
  app.controller.position(1);
  expect(app.store.state.prefs.last?.route).toContain("?from=11692");
  expect(app.store.state.prefs.last?.scrollIndex).toBe(1);
  expect(Object.values(app.store.state.prefs.visited)).toEqual([
    { bytesRead: 150185, size: 150185, rows: rows.length, from: 0 },
  ]);
  app.controller.filter({ text: "Acer" });
  expect(
    app.commands.filter((command) => command.type === "open"),
  ).toHaveLength(1);
  app.controller.navigate({ kind: "home" });
  expect(app.store.state.prefs.last?.route).toContain("?from=11692");
});
