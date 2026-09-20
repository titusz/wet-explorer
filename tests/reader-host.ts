/** Execute the production reader in a worker thread against an offline file host. */
import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import type { ReaderCommand } from "../src/worker/protocol.ts";
import { attachReader, type ReaderScope } from "../src/worker/reader.worker.ts";

const config = workerData as {
  fixture: string;
  busy?: number;
  latency?: number;
  bandwidth?: number;
};
const bytes = new Uint8Array(
  readFileSync(new URL(`./fixtures/${config.fixture}`, import.meta.url)),
);
const requests: { range: string | null; method: string; active: number }[] = [];
let active = 0;
let peak = 0;
let busy = config.busy ?? 0;

/** Wait cooperatively so aborting a request releases its pending latency timer. */
async function delay(
  ms: number,
  signal: AbortSignal | null | undefined,
): Promise<void> {
  signal?.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(resolve, ms);
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** Serve on-demand body chunks and account for each request until close/cancel. */
async function fixtureFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!url.startsWith("https://data.commoncrawl.org/"))
    throw new Error(`Unexpected host: ${url}`);
  init?.signal?.throwIfAborted();
  active++;
  peak = Math.max(peak, active);
  const range = new Headers(init?.headers).get("Range");
  requests.push({ range, method: init?.method ?? "GET", active });
  try {
    await delay(config.latency ?? 0, init?.signal);
  } catch (error) {
    active--;
    throw error;
  }
  if (busy-- > 0) {
    active--;
    return new Response("<Code>SlowDown</Code>", { status: 503 });
  }
  const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
  if (!match) {
    active--;
    throw new Error("A worker made an unbounded file request.");
  }
  let position = Number(match[1]);
  const last = Math.min(Number(match[2]), bytes.length - 1);
  if (position > last) {
    active--;
    return new Response(null, { status: 416 });
  }
  const first = position;
  let done = false;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) return;
      if (position > last) {
        done = true;
        active--;
        controller.close();
        return;
      }
      const end = Math.min(last + 1, position + 16384);
      if (config.bandwidth)
        await delay(((end - position) * 1000) / config.bandwidth, init?.signal);
      if (done) return;
      controller.enqueue(bytes.subarray(position, end));
      position = end;
    },
    cancel() {
      if (!done) {
        done = true;
        active--;
      }
    },
  });
  return new Response(body, {
    status: 206,
    headers: {
      "Content-Range": `bytes ${first}-${last}/${bytes.length}`,
      "Content-Length": String(last - first + 1),
    },
  });
}

const scope: ReaderScope = {
  onmessage: null,
  postMessage: (event) => parentPort?.postMessage(event),
};
const engine = attachReader(scope, {
  source: { fetcher: fixtureFetch, retryDelays: [10, 10], random: () => 0.5 },
  reportMode: () => {},
});
parentPort?.on(
  "message",
  async (command: ReaderCommand | { type: "inspect"; id: number }) => {
    if (command.type === "inspect") {
      await engine.idle();
      parentPort?.postMessage({
        type: "inspection",
        id: command.id,
        cacheBytes: engine.cacheBytes,
        requests,
        peak,
        active,
      });
    } else scope.onmessage?.({ data: command });
  },
);
parentPort?.postMessage({ type: "ready" });
