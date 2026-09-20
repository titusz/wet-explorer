/** Compute Text-Codes off the page thread after the panel requests its first code. */
import wasmUrl from "@iscc/wasm/iscc_wasm_bg.wasm?url";
import { loadTextCoder } from "./iscc.ts";
import type { IsccCommand, IsccEvent } from "./iscc-protocol.ts";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<IsccCommand>) => void) | null;
  postMessage(event: IsccEvent): void;
};
let latest = -1;

/** Discard superseded work before generation and keep load failures local to the panel. */
async function compute(command: IsccCommand): Promise<void> {
  latest = command.requestId;
  try {
    const encode = await loadTextCoder(wasmUrl);
    if (latest !== command.requestId) return;
    scope.postMessage({
      requestId: command.requestId,
      code: encode(command.text),
    });
  } catch {
    if (latest === command.requestId)
      scope.postMessage({ requestId: command.requestId, error: true });
  }
}

scope.onmessage = (event) => {
  void compute(event.data);
};
