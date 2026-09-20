/** Show one compact metadata row, including present but muted short records. */
import { html, LitElement, nothing } from "lit";
import type { RecordMeta } from "../cc/record.ts";
import { bytes } from "./format.ts";

export class RecordRow extends LitElement {
  static properties = {
    row: { attribute: false },
    selected: { type: Boolean },
    active: { type: Boolean },
    position: { type: Number },
    total: { type: Number },
  };
  declare row: RecordMeta | undefined;
  declare selected: boolean;
  declare active: boolean;
  declare position: number;
  declare total: number;

  /** Preserve global styles and a single accessible listbox tree. */
  protected createRenderRoot(): HTMLElement {
    return this;
  }

  /** Insert all remote metadata as escaped text; source URLs are not followed here. */
  protected render() {
    const row = this.row;
    if (!row) return nothing;
    return html`<button type="button" role="option" id="row-${row.offset}" tabindex="-1"
      aria-selected=${!!this.selected} aria-posinset=${this.position + 1} aria-setsize=${this.total}
      class="record-row ${row.short ? "short" : ""} ${this.active ? "active" : ""}">
      <bdi class="row-title" title=${row.title}>${row.title}</bdi>
      <span class="row-meta"><bdi class="row-host">${row.host ?? ""}</bdi><span>${row.languages.join(", ") || "language unknown"}</span><span class="row-size">${bytes(row.bytes)}</span><meter class="row-length" min="0" max="16" value=${Math.min(16, Math.log2(Math.max(1, row.chars)))} aria-hidden="true"></meter></span>
    </button>`;
  }
}
customElements.define("record-row", RecordRow);
