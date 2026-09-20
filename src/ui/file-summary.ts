/** Offer a bounded local summary and two explicit ways forward at end of file. */
import { html, nothing } from "lit";
import type { RecordMeta } from "../cc/record.ts";
import { startController } from "../state/controller.ts";
import { summarizeRows } from "../state/filters.ts";
import { store } from "../state/store.ts";
import { languageName, number } from "./format.ts";
import { StoreElement } from "./store-element.ts";
import "./random-file.ts";

export class FileSummary extends StoreElement {
  private rows: readonly RecordMeta[] = [];
  private summary = summarizeRows([]);

  /** Retain completed counts across record selection and copy-button updates. */
  protected willUpdate(): void {
    if (this.rows === store.state.rows) return;
    this.rows = store.state.rows;
    this.summary = summarizeRows(this.rows);
  }

  /** Never describe a forward-only read as the file's complete record count. */
  protected render() {
    const { stream, intent } = store.state;
    if (!stream) return nothing;
    const summary = this.summary;
    return html`<section class="file-summary" aria-label="End of file"><div class="eyebrow">End of file</div><h2>${number.format(summary.records)} records read${stream.from ? " from this position" : ""}</h2><p>${summary.languages.map(([code, count]) => `${languageName(code)} ${Math.round((count * 100) / Math.max(1, summary.records))}%`).join(" · ") || "No text records in this file."}</p><p>${number.format(summary.short)} short records · ${Math.round((summary.short * 100) / Math.max(1, summary.records))}% of records read</p><div class="summary-actions"><button type="button" class="secondary-action" ?disabled=${intent?.kind === "next" && intent.pending} @click=${() => startController().nextFile(stream.file)}>${intent?.kind === "next" && intent.pending ? "Loading the file list…" : "Next file"}</button><random-file .crawl=${stream.file.crawl}></random-file></div>${intent?.kind === "next" && intent.error ? html`<p role="status">${intent.error}</p><a tabindex="0" href="#/">Choose another crawl</a>` : nothing}</section>`;
  }
}
customElements.define("file-summary", FileSummary);
