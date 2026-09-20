/** Present the five stream states and the automatic throttling countdown. */
import { html, nothing } from "lit";
import { startController } from "../state/controller.ts";
import { store } from "../state/store.ts";
import { bytes, number } from "./format.ts";
import { StoreElement } from "./store-element.ts";

export class StreamStatusBar extends StoreElement {
  /** Separate records observed from byte progress, publishing no estimated total. */
  protected render() {
    const stream = store.state.stream;
    if (!stream) return nothing;
    const waiting = stream.countdown !== null;
    const label = stream.state[0]?.toUpperCase() + stream.state.slice(1);
    const read = Math.max(0, stream.bytesRead - stream.from);
    const span =
      stream.size === null ? null : Math.max(0, stream.size - stream.from);
    const caption =
      stream.state === "connecting"
        ? "Asking Common Crawl for the file"
        : `${stream.from ? "From this position: " : ""}${bytes(read)}${span !== null && stream.state !== "complete" ? ` of ${bytes(span)}` : ""} · ${number.format(stream.rows)} records${stream.state === "complete" ? " read" : stream.state === "interrupted" ? " kept" : " so far"}`;
    return html`
      <div class="stream-status" data-state=${stream.state} data-waiting=${waiting}>
        ${waiting ? html`<p class="busy-caption" role="status">Common Crawl is busy. Continuing in ${stream.countdown} s.</p>` : nothing}
        <div class="status-line">
          <span class="status-dot" aria-hidden="true"></span>
          <span class="status-label" role="status" aria-live="polite">${label}</span>
          <span class="status-caption" title=${caption}>${caption}</span>
          ${
            stream.state === "reading" || stream.state === "connecting"
              ? html`<button type="button" class="compact-button" @click=${() => startController().playback("pause")}>Pause</button>`
              : stream.state !== "complete"
                ? html`<button type="button" class="compact-button filled" @click=${() => startController().playback("continue")}>Continue</button>`
                : nothing
          }
        </div>
        <progress class="byte-progress" aria-label=${stream.from ? "Bytes read from this position" : "File bytes read"} max=${span ?? 1} value=${span === null ? nothing : read}></progress>
      </div>`;
  }
}
customElements.define("stream-status-bar", StreamStatusBar);
