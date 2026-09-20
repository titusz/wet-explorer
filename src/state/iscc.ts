/** Lazily coordinate Text-Code work and retain results only for the open record. */
import type { IsccCommand, IsccEvent } from "../worker/iscc-protocol.ts";
import type { Store } from "./store.ts";

export interface IsccPort {
  postMessage(command: IsccCommand): void;
  onmessage: ((event: MessageEvent<IsccEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  terminate(): void;
}

/** Construct the separate worker only after a visible panel asks for a code. */
function createWorker(): IsccPort {
  return new Worker(new URL("../worker/iscc.worker.ts", import.meta.url), {
    type: "module",
  });
}

export class IsccController {
  private worker: IsccPort | null = null;
  private requestId = -1;

  /** Accept a lazy worker factory so state behavior can be verified without a browser. */
  constructor(
    private readonly store: Store,
    private readonly create = createWorker,
  ) {}

  /** Compute once for the current payload, leaving text and record navigation independent. */
  compute(requestId: number): void {
    const selection = this.store.state.selection;
    if (
      selection?.requestId !== requestId ||
      !selection.record ||
      selection.iscc?.state === "computing" ||
      selection.iscc?.state === "ready"
    )
      return;
    this.requestId = requestId;
    this.store.update({
      selection: { ...selection, iscc: { state: "computing" } },
    });
    try {
      if (!this.worker) {
        this.worker = this.create();
        this.worker.onmessage = (event) => this.receive(event.data);
        this.worker.onerror = (event) => {
          event.preventDefault();
          this.dispose();
          this.receive({ requestId: this.requestId, error: true });
        };
      }
      this.worker.postMessage({ requestId, text: selection.record.text });
    } catch {
      this.receive({ requestId, error: true });
    }
  }

  /** Ignore results for a record that navigation has already replaced. */
  private receive(event: IsccEvent): void {
    const selection = this.store.state.selection;
    if (selection?.requestId !== event.requestId) return;
    this.store.update({
      selection: {
        ...selection,
        iscc:
          "code" in event
            ? { state: "ready", code: event.code }
            : { state: "idle", error: true },
      },
    });
  }

  /** Release the worker and its event handlers when the application is disposed. */
  dispose(): void {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }
}
