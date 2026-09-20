/** Verify lazy Text-Code requests, navigation races, and recoverable worker errors. */
import { expect, test } from "vitest";
import { fixtureRecords } from "../../tests/records.ts";
import type { IsccCommand, IsccEvent } from "../worker/iscc-protocol.ts";
import { IsccController, type IsccPort } from "./iscc.ts";
import { Store } from "./store.ts";

/** Keep real record data while exposing deterministic worker message delivery. */
function harness() {
  const store = new Store();
  const commands: IsccCommand[] = [];
  let creations = 0;
  let terminated = false;
  const port: IsccPort = {
    onmessage: null,
    onerror: null,
    postMessage: (command) => {
      commands.push(command);
    },
    terminate: () => {
      terminated = true;
    },
  };
  const controller = new IsccController(store, () => {
    creations++;
    return port;
  });
  return {
    store,
    controller,
    commands,
    port,
    created: () => creations,
    terminated: () => terminated,
    emit: (event: IsccEvent) =>
      port.onmessage?.(new MessageEvent("message", { data: event })),
  };
}

const record = fixtureRecords("real-head.warc.wet.gz")[2];
if (!record) throw new Error("Missing reference record");

test("no worker exists before an explicit request for the current loaded record", () => {
  const app = harness();
  app.controller.compute(1);
  expect(app.created()).toBe(0);
  app.store.update({ selection: { requestId: 1, record, error: null } });
  app.controller.compute(2);
  expect(app.created()).toBe(0);
  app.controller.compute(1);
  app.controller.compute(1);
  expect(app.created()).toBe(1);
  expect(app.commands).toEqual([{ requestId: 1, text: record.text }]);
  expect(app.store.state.selection?.iscc).toEqual({ state: "computing" });
  app.emit({ requestId: 1, code: "ISCC:reference" });
  app.controller.compute(1);
  expect(app.commands).toHaveLength(1);
  expect(app.store.state.selection?.record).toBe(record);
});

test("a late code or failure cannot replace the next record's panel", () => {
  const app = harness();
  app.store.update({ selection: { requestId: 1, record, error: null } });
  app.controller.compute(1);
  app.store.update({ selection: { requestId: 2, record, error: null } });
  app.controller.compute(2);
  app.emit({ requestId: 1, code: "ISCC:stale" });
  app.emit({ requestId: 1, error: true });
  expect(app.store.state.selection?.iscc).toEqual({ state: "computing" });
  app.emit({ requestId: 2, code: "ISCC:current" });
  expect(app.store.state.selection?.iscc).toEqual({
    state: "ready",
    code: "ISCC:current",
  });
  expect(app.created()).toBe(1);
});

test("a failed load permits explicit retry without losing the readable record", () => {
  const app = harness();
  app.store.update({ selection: { requestId: 1, record, error: null } });
  app.controller.compute(1);
  app.emit({ requestId: 1, error: true });
  expect(app.store.state.selection?.iscc).toEqual({
    state: "idle",
    error: true,
  });
  expect(app.store.state.selection?.record).toBe(record);
  app.controller.compute(1);
  expect(app.commands).toHaveLength(2);
  app.emit({ requestId: 1, code: "ISCC:recovered" });
  expect(app.store.state.selection?.iscc).toEqual({
    state: "ready",
    code: "ISCC:recovered",
  });
  app.controller.dispose();
  expect(app.terminated()).toBe(true);
  expect(app.port.onmessage).toBeNull();
});
