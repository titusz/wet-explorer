/** Keep the three list filters beside an explicit records-already-read scope. */
import { html, nothing } from "lit";
import type { RecordMeta } from "../cc/record.ts";
import { startController } from "../state/controller.ts";
import { store } from "../state/store.ts";
import { languageName } from "./format.ts";
import { StoreElement } from "./store-element.ts";

export class FilterBar extends StoreElement {
  private rows: readonly RecordMeta[] = [];
  private languages: string[] = [];

  /** Recount source language options only when records arrive, not on every heartbeat. */
  protected willUpdate(): void {
    if (this.rows === store.state.rows) return;
    this.rows = store.state.rows;
    this.languages = [
      ...new Set(this.rows.flatMap((row) => row.languages)),
    ].sort((a, b) => languageName(a).localeCompare(languageName(b)));
  }

  /** Name the text filter's metadata fields and keep short-record hiding opt-in. */
  protected render() {
    const { filters } = store.state;
    const filtered = Boolean(
      filters.text || filters.language || filters.hideShort,
    );
    return html`<form class="filter-controls" aria-label="Filter records already read" @submit=${(event: SubmitEvent) => event.preventDefault()}><input id="record-filter" type="search" aria-label="Filter by title or host" placeholder="Title or host in records read" .value=${filters.text} @input=${(event: Event) => startController().filter({ text: (event.target as HTMLInputElement).value })}><select aria-label="Language in records read" .value=${filters.language} @change=${(event: Event) => startController().filter({ language: (event.target as HTMLSelectElement).value })}><option value="">All languages</option>${this.languages.map((code) => html`<option value=${code}>${languageName(code)}</option>`)}<option value="unknown">Language unknown</option></select><label class="short-filter"><input type="checkbox" .checked=${filters.hideShort} @change=${(event: Event) => startController().filter({ hideShort: (event.target as HTMLInputElement).checked })}>Hide short records</label>${filtered ? html`<button type="button" class="clear-filter" @click=${() => startController().filter({ text: "", language: "", hideShort: false })}>Clear filters</button>` : nothing}</form>`;
  }
}
customElements.define("filter-bar", FilterBar);
