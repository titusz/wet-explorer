/** Drive the actual worker protocol and retain events for deterministic assertions. */
import { Worker } from "node:worker_threads";
import type { ReaderCommand, ReaderEvent } from "../src/worker/protocol.ts";

type Inspection = {
  type: "inspection";
  id: number;
  cacheBytes: number;
  requests: { range: string; method: string; active: number }[];
  peak: number;
  active: number;
};
type Output = ReaderEvent | Inspection | { type: "ready" };

export class ReaderHarness {
  private readonly thread: Worker;
  readonly events: Output[] = [];
  readonly arrivals: { event: Output; time: number }[] = [];
  private readonly listeners = new Set<() => void>();
  private failure: Error | null = null;

  /** Start an isolated reader with a real fixture and optional transport faults. */
  constructor(
    fixture: string,
    options: { busy?: number; latency?: number; bandwidth?: number } = {},
  ) {
    this.thread = new Worker(new URL("./reader-host.ts", import.meta.url), {
      workerData: { fixture, ...options },
    });
    this.thread.on("message", (event: Output) => {
      this.events.push(event);
      this.arrivals.push({ event, time: performance.now() });
      for (const notify of this.listeners) notify();
    });
    this.thread.on("error", (error: Error) => {
      this.failure = error;
      for (const notify of this.listeners) notify();
    });
  }

  /** Send an ordinary command or an inspection supported only by the test host. */
  send(command: ReaderCommand | { type: "inspect"; id: number }): void {
    this.thread.postMessage(command);
  }

  /** Wait for a matching event, including events already delivered. */
  async wait<T extends Output["type"]>(
    type: T,
    predicate: (event: Extract<Output, { type: T }>) => boolean = () => true,
  ): Promise<Extract<Output, { type: T }>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let check = () => {};
    try {
      return await new Promise((resolve, reject) => {
        check = () => {
          if (this.failure) {
            reject(this.failure);
            return;
          }
          const found = this.events.find(
            (event) =>
              event.type === type &&
              predicate(event as Extract<Output, { type: T }>),
          );
          if (found) resolve(found as Extract<Output, { type: T }>);
        };
        this.listeners.add(check);
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `Timed out waiting for ${type}; received ${this.events
                  .map((event) => event.type)
                  .slice(-12)
                  .join(", ")}`,
              ),
            ),
          10000,
        );
        check();
      });
    } finally {
      clearTimeout(timer);
      this.listeners.delete(check);
    }
  }

  /** Terminate the test worker even when an assertion fails. */
  async close(): Promise<void> {
    await this.thread.terminate();
  }
}
