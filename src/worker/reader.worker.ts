/** Attach the reader engine to a browser worker or an offline worker-test host. */

import type { ReaderCommand, ReaderEvent } from "./protocol.ts";
import { ReaderEngine, type ReaderOptions } from "./reader-engine.ts";

export interface ReaderScope {
  onmessage: ((event: { data: ReaderCommand }) => void) | null;
  postMessage: (event: ReaderEvent) => void;
}

/** Wire the same protocol handler in production and worker integration tests. */
export function attachReader(
  scope: ReaderScope,
  options?: ReaderOptions,
): ReaderEngine {
  const engine = new ReaderEngine((event) => scope.postMessage(event), options);
  scope.onmessage = (event) => engine.handle(event.data);
  return engine;
}

if (typeof self !== "undefined") attachReader(self as unknown as ReaderScope);
