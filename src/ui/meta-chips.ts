/** Present human-readable date, language, and text size metadata. */
import { html, nothing } from "lit";
import type { RecordMeta } from "../cc/record.ts";
import { bytes, languageName, number } from "./format.ts";
import { LightElement } from "./light-element.ts";

const dates = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export class MetaChips extends LightElement {
  static properties = { meta: { attribute: false } };
  declare meta: RecordMeta | undefined;

  /** Group at most five chips while retaining the complete metadata in technical details. */
  protected render() {
    const meta = this.meta;
    if (!meta) return nothing;
    const date = meta.date ? new Date(meta.date) : null;
    return html`<div class="meta-chips"><span class="meta-chip">${date && Number.isFinite(date.getTime()) ? dates.format(date) : "date unknown"}</span>
      ${meta.languages.length ? meta.languages.slice(0, 3).map((code) => html`<span class="meta-chip identifier">${languageName(code)} · ${code}</span>`) : html`<span class="meta-chip">language unknown</span>`}
      <span class="meta-chip identifier">${bytes(meta.bytes)} · ${number.format(meta.chars)} characters · ${number.format(meta.lines)} lines</span></div>`;
  }
}
customElements.define("meta-chips", MetaChips);
