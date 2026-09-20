/** Render only the visible record window and report scroll-driven read-ahead intents. */
import { html, nothing, type PropertyValues } from "lit";
import type { RecordMeta } from "../cc/record.ts";
import { startController } from "../state/controller.ts";
import { emptyFilters, type Filters, filterRows } from "../state/filters.ts";
import { store } from "../state/store.ts";
import { number } from "./format.ts";
import { StoreElement } from "./store-element.ts";
import { ROW_HEIGHT, rowWindow } from "./window.ts";
import "./record-row.ts";
import "./stream-status-bar.ts";
import "./filter-bar.ts";
import "./file-summary.ts";

export class RecordStream extends StoreElement {
  private top = 0;
  private height = 676;
  private active = 0;
  private fileId = -1;
  private lastVisible = -1;
  private frame: number | null = null;
  private resize?: ResizeObserver;
  private countedRows: readonly RecordMeta[] = [];
  private shortCount = 0;
  private filteredRows: readonly RecordMeta[] = [];
  private filters: Filters = emptyFilters();
  private selectedOffset: number | null = null;

  /** Watch the viewport instead of assuming a fixed desktop screen height. */
  protected firstUpdated(): void {
    const viewport = this.querySelector<HTMLElement>(".record-viewport");
    if (viewport) {
      this.resize = new ResizeObserver(() => this.queueMeasure());
      this.resize.observe(viewport);
    }
  }

  /** Reset window coordinates on file navigation before deriving the next render. */
  protected willUpdate(_changed: PropertyValues): void {
    const filtersChanged = store.state.filters !== this.filters;
    if (store.state.rows !== this.countedRows || filtersChanged) {
      this.filters = store.state.filters;
      this.filteredRows = filterRows(store.state.rows, this.filters);
    }
    if (store.state.rows !== this.countedRows) {
      this.countedRows = store.state.rows;
      this.shortCount = this.countedRows.filter((row) => row.short).length;
    }
    const id = store.state.stream?.id ?? -1;
    if (this.fileId !== id || filtersChanged) {
      this.fileId = id;
      this.top = 0;
      this.active = 0;
      this.lastVisible = -1;
      this.selectedOffset = null;
      const viewport = this.querySelector<HTMLElement>(".record-viewport");
      if (viewport) viewport.scrollTop = 0;
    }
    const route = store.state.route;
    if (route.kind === "record" && route.offset !== this.selectedOffset) {
      const index = this.filteredRows.findIndex(
        (row) => row.offset === route.offset,
      );
      if (index >= 0) {
        this.selectedOffset = route.offset;
        this.active = index;
        this.scrollToActive();
      }
    }
  }

  /** Apply dynamic geometry through DOM style properties permitted by the CSP. */
  protected updated(): void {
    const rows = this.filteredRows;
    const window = rowWindow(rows.length, this.top, this.height);
    const canvas = this.querySelector<HTMLElement>(".record-canvas");
    const items = this.querySelector<HTMLElement>(".record-window");
    if (canvas) canvas.style.height = `${rows.length * ROW_HEIGHT}px`;
    if (items)
      items.style.transform = `translateY(${window.start * ROW_HEIGHT}px)`;
    const last = rows[window.lastVisible];
    const unfilteredIndex = last ? store.state.rows.indexOf(last) : -1;
    const first = rows[Math.floor(this.top / ROW_HEIGHT)];
    if (first) startController().position(store.state.rows.indexOf(first));
    if (unfilteredIndex !== this.lastVisible) {
      this.lastVisible = unfilteredIndex;
      startController().visible(this.lastVisible);
    }
  }

  /** Release resize observers and frame work when leaving the stream. */
  disconnectedCallback(): void {
    this.resize?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    super.disconnectedCallback();
  }

  /** Coalesce scroll and resize events into one viewport measurement per frame. */
  private queueMeasure(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      const viewport = this.querySelector<HTMLElement>(".record-viewport");
      if (!viewport) return;
      this.top = viewport.scrollTop;
      this.height = viewport.clientHeight;
      this.requestUpdate();
    });
  }

  /** Move the keyboard cursor without placing thousands of rows in the tab order. */
  private keydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
      return;
    const rows = this.filteredRows;
    const delta =
      event.key === "ArrowDown" || event.key.toLowerCase() === "j"
        ? 1
        : event.key === "ArrowUp" || event.key.toLowerCase() === "k"
          ? -1
          : 0;
    if (event.key === "Enter") {
      event.preventDefault();
      this.open(this.active);
    } else if (delta || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      this.active = Math.max(
        0,
        Math.min(
          rows.length - 1,
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? rows.length - 1
              : this.active + delta,
        ),
      );
      this.scrollToActive();
      this.queueMeasure();
      this.requestUpdate();
    } else if (event.key === " ") {
      event.preventDefault();
      startController().playback(
        store.state.stream?.state === "reading" ? "pause" : "continue",
      );
    }
  }

  /** Keep an explicitly selected record visible without moving the list on row arrival. */
  private scrollToActive(): void {
    const viewport = this.querySelector<HTMLElement>(".record-viewport");
    if (!viewport?.clientHeight) return;
    const y = this.active * ROW_HEIGHT;
    if (y < viewport.scrollTop) viewport.scrollTop = y;
    else if (y + ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight)
      viewport.scrollTop = y + ROW_HEIGHT - viewport.clientHeight;
    this.top = viewport.scrollTop;
  }

  /** Open the selected record through its permanent URL. */
  private open(index: number): void {
    const row = this.filteredRows[index];
    if (!row) return;
    this.active = index;
    const hash = startController().recordRoute(row);
    if (location.hash === hash) {
      document
        .querySelector<HTMLElement>("wet-reader .record-heading")
        ?.focus({ preventScroll: true });
    } else location.hash = hash;
  }

  /** Keep row markup bounded independently of the number of metadata entries retained. */
  protected render() {
    const { stream, route } = store.state;
    const rows = this.filteredRows;
    const filtered = Boolean(
      this.filters.text || this.filters.language || this.filters.hideShort,
    );
    const scope = `${number.format(store.state.rows.length)} records${stream?.state === "complete" ? "" : " read so far"}${stream?.state === "reading" || stream?.state === "connecting" ? ", still reading" : stream?.state === "paused" ? ", paused" : ""}`;
    const window = rowWindow(rows.length, this.top, this.height);
    const activeRow =
      this.active >= window.start && this.active < window.end
        ? rows[this.active]
        : undefined;
    return html`
      <filter-bar></filter-bar>
      <div class="stream-scope"><span>${filtered ? `${number.format(rows.length)} matches in ${scope}` : `${number.format(stream?.rows ?? 0)} records read${stream?.state === "complete" ? "" : " so far"}`}</span><span>${number.format(this.shortCount)} short records ${this.filters.hideShort ? "hidden" : "muted"}</span></div>
      <div class="record-viewport" role="listbox" tabindex="0" aria-label="Records read from this file" aria-activedescendant=${activeRow ? `row-${activeRow.offset}` : nothing} @scroll=${this.queueMeasure} @keydown=${this.keydown}>
        <div class="record-canvas"><div class="record-window">
          ${rows
            .slice(window.start, window.end)
            .map(
              (row, localIndex) =>
                html`<record-row .row=${row} .position=${window.start + localIndex} .total=${rows.length} .active=${this.active === window.start + localIndex} .selected=${route.kind === "record" && row.offset === route.offset} @click=${() => this.open(window.start + localIndex)}></record-row>`,
            )}
        </div></div>
        ${filtered && !rows.length ? html`<div class="list-message" role="status">No matches in ${scope}. <button type="button" class="clear-filter" @click=${() => startController().filter(emptyFilters())}>Clear filters</button></div>` : nothing}
        ${!filtered && !rows.length && (stream?.state === "connecting" || stream?.state === "reading") ? html`<div class="row-skeletons" aria-label="Waiting for records">${Array.from({ length: 12 }, () => html`<div class="row-skeleton"><span></span><span></span></div>`)}</div>` : nothing}
        ${!rows.length && stream?.state === "interrupted" ? html`<p class="list-message">Common Crawl did not answer. Continue to try again.</p>` : nothing}
      </div>
      ${stream?.state === "complete" && store.state.rows.length >= stream.rows ? html`<file-summary></file-summary>` : nothing}
      <stream-status-bar></stream-status-bar>`;
  }
}
customElements.define("record-stream", RecordStream);
