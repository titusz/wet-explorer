/** Present one record as readable text, with bounded reveal and exact raw inspection. */
import { html, nothing, type PropertyValues } from "lit";
import { webUrl } from "../cc/record.ts";
import { routeHash } from "../cc/urls.ts";
import { startController } from "../state/controller.ts";
import { store } from "../state/store.ts";
import type { OpenRecord } from "../worker/protocol.ts";
import { bytes, number } from "./format.ts";
import { icon } from "./icons.ts";
import { StoreElement } from "./store-element.ts";
import {
  characterCount,
  middle,
  textHeading,
  textPageEnd,
  textPages,
  textTailStart,
} from "./text.ts";
import "./copy-button.ts";
import "./meta-chips.ts";
import "./raw-toggle.ts";
import "./technical-details.ts";
import "./iscc-panel.ts";

/** Focus the stream after the hash router has restored its visible viewport. */
function focusStream(): void {
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>("record-stream [role=listbox]")
      ?.focus(),
  );
}

/** Restore list focus for ordinary in-tab navigation while preserving modified clicks. */
function focusAfterBack(event?: MouseEvent): void {
  if (
    event &&
    (event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey)
  )
    return;
  addEventListener("hashchange", focusStream, { once: true });
}

export class Reader extends StoreElement {
  static properties = {
    raw: { state: true },
    start: { state: true },
    end: { state: true },
    titleExpanded: { state: true },
    urlExpanded: { state: true },
  };
  declare raw: boolean;
  declare start: number;
  declare end: number;
  declare titleExpanded: boolean;
  declare urlExpanded: boolean;
  private record?: OpenRecord;
  private heading = { title: "", bodyStart: 0 };
  private headingPages: string[] = [];
  private totalChars = 0;
  private seenChars = 0;
  private earlierChars = 0;
  private requestId = -1;
  private focusRecord = false;
  private resetScroll = false;
  private revealObserver?: IntersectionObserver;
  private observed?: Element;

  /** Start in the normal reader presentation with an empty text window. */
  constructor() {
    super();
    this.raw = false;
    this.start = 0;
    this.end = 0;
    this.titleExpanded = false;
    this.urlExpanded = false;
  }

  /** Reset text windows only when a record or presentation changes. */
  protected willUpdate(changed: PropertyValues): void {
    const selection = store.state.selection;
    const record = selection?.record ?? undefined;
    if ((selection?.requestId ?? -1) !== this.requestId) {
      this.requestId = selection?.requestId ?? -1;
      this.titleExpanded = false;
      this.urlExpanded = false;
      this.resetScroll = true;
    }
    if (record !== this.record || changed.has("raw")) {
      this.focusRecord = !!record && record !== this.record;
      this.record = record;
      this.heading = record
        ? textHeading(record.text, record.meta.title)
        : { title: "", bodyStart: 0 };
      this.headingPages = textPages(this.heading.title);
      this.resetWindow();
    }
  }

  /** Preserve the article scroll position while unrelated stream rows arrive. */
  protected updated(): void {
    const scroll = this.querySelector<HTMLElement>(".reader-scroll");
    if (this.resetScroll && scroll) {
      scroll.scrollTop = 0;
      this.resetScroll = false;
    }
    if (this.focusRecord) {
      this.querySelector<HTMLElement>(".record-heading")?.focus({
        preventScroll: true,
      });
      this.focusRecord = false;
    }
    const marker = this.querySelector(".reveal-sentinel");
    if (marker === this.observed) return;
    this.revealObserver?.disconnect();
    this.observed = marker ?? undefined;
    if (marker && scroll) {
      this.revealObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) this.reveal();
        },
        { root: scroll, rootMargin: "400px" },
      );
      this.revealObserver.observe(marker);
    }
  }

  /** Release the observer and record reference when leaving the reader. */
  disconnectedCallback(): void {
    this.revealObserver?.disconnect();
    this.record = undefined;
    super.disconnectedCallback();
  }

  /** Return the chosen plain source string without parsing or modifying raw content. */
  private source(): string {
    return this.record
      ? this.raw
        ? this.record.rawText
        : this.record.text
      : "";
  }

  /** Restore the opening screenfuls and their exact remaining-character count. */
  private resetWindow(): void {
    const source = this.source();
    this.start = this.raw ? 0 : this.heading.bodyStart;
    this.end = textPageEnd(source, this.start);
    this.totalChars = this.raw
      ? characterCount(source)
      : (this.record?.meta.chars ?? 0);
    this.seenChars = characterCount(source.slice(0, this.end));
    this.earlierChars = 0;
    this.resetScroll = true;
  }

  /** Add a bounded amount of text when its trailing marker approaches the viewport. */
  private reveal(): void {
    const source = this.source();
    if (this.end >= source.length) return;
    const next = textPageEnd(source, this.end);
    this.seenChars += characterCount(source.slice(this.end, next));
    this.end = next;
  }

  /** Jump to a bounded tail instead of synchronously laying out a giant record. */
  private async jumpToEnd(): Promise<void> {
    const source = this.source();
    this.start = Math.max(
      this.raw ? 0 : this.heading.bodyStart,
      textTailStart(source),
    );
    this.end = source.length;
    this.earlierChars = characterCount(
      source.slice(this.raw ? 0 : this.heading.bodyStart, this.start),
    );
    this.seenChars = this.totalChars;
    await this.updateComplete;
    this.querySelector(".text-end")?.scrollIntoView({ block: "end" });
  }

  /** Apply a presentation change from either the toggle or its keyboard shortcut. */
  private changeRaw(event: CustomEvent<boolean>): void {
    this.raw = event.detail;
  }

  /** Keep shortcuts out of editable controls and preserve ordinary button activation. */
  private keydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      target.closest("input, textarea, select, [contenteditable=true]")
    )
      return;
    const key = event.key.toLowerCase();
    if (key === "t") {
      event.preventDefault();
      this.raw = !this.raw;
    } else if (key === "c") {
      event.preventDefault();
      this.querySelector<HTMLButtonElement>(
        ".reader-footer copy-button button",
      )?.click();
    } else if (
      key === "j" ||
      key === "arrowdown" ||
      key === "k" ||
      key === "arrowup"
    ) {
      if (target.closest("button, summary")) return;
      event.preventDefault();
      startController().step(key === "j" || key === "arrowdown" ? 1 : -1);
    } else if (key === "escape") {
      event.preventDefault();
      const route = store.state.route;
      if (route.kind === "record") {
        focusAfterBack();
        location.hash = routeHash({
          kind: "file",
          file: route.file,
          from: store.state.stream?.from ?? route.offset,
        });
      }
    } else if (key === " " && !target.closest("button, summary, a")) {
      event.preventDefault();
      startController().playback(
        store.state.stream?.state === "reading" ? "pause" : "continue",
      );
    }
  }

  /** Show a calm skeleton or a recoverable direct-record error. */
  private pendingView() {
    const { selection, route } = store.state;
    if (selection?.error)
      return html`<section class="reader-error"><h1>${selection.error === "invalid-link" ? "This link does not point to a record" : "This record did not arrive"}</h1><p>${selection.error === "invalid-link" ? "The bytes at this position are not a complete WET record." : "Common Crawl did not answer. You can try again."}</p><button class="compact-button filled" type="button" @click=${() => startController().navigate(route)}>Try again</button></section>`;
    const progress = selection?.progress;
    return html`<div class="reader-skeleton" aria-label="Loading record"><span></span><span></span><div class="skeleton-chips"><i></i><i></i><i></i></div>${Array.from({ length: 7 }, () => html`<span class="skeleton-line"></span>`)}<p role="status">${progress?.locating ? `Locating this record, reading the file from the start · ${bytes(progress.bytesRead)}${progress.size === null ? " read" : ` of ${bytes(progress.size)}`}` : progress?.countdown !== null && progress?.countdown !== undefined ? `Common Crawl is busy. Continuing in ${progress.countdown} s.` : "Fetching this record"}</p>${progress?.locating ? html`<progress aria-label="File bytes read while locating this record" max=${progress.size ?? 1} value=${progress.size === null ? nothing : progress.bytesRead}></progress>` : nothing}</div>`;
  }

  /** Set the record as text nodes, keeping its controls outside the content direction. */
  protected render() {
    const { selection, route, stream } = store.state;
    if (route.kind !== "record")
      return html`<section class="reader-empty"><h2>Choose a record to read</h2><p>Records arrive as the file is read. Select a row to open its text.</p></section>`;
    const record = this.record;
    const link = new URL(routeHash(route), location.href).href;
    const target = webUrl(record?.meta.url ?? null);
    const source = this.source();
    const remaining = Math.max(0, this.totalChars - this.seenChars);
    return html`<section class="reader-pane" aria-label="Record reader" @keydown=${this.keydown}>

      <div class="reader-scroll"><div class="reader-measure">
        ${
          record
            ? html`<header class="record-header"><h1 class="record-heading" tabindex="-1" dir="auto">${this.titleExpanded ? (this.headingPages.length > 1 ? this.headingPages.map((page) => html`<span class="title-page">${page}</span>`) : this.heading.title) : `${record.meta.title}${this.heading.title.length > record.meta.title.length ? "…" : ""}`}</h1>
          ${
            this.heading.title.length > record.meta.title.length
              ? html`<button class="text-button" type="button" aria-expanded=${this.titleExpanded} @click=${() => {
                  this.titleExpanded = !this.titleExpanded;
                }}>${this.titleExpanded ? "Collapse title" : "Expand title"}</button><copy-button .value=${this.heading.title} label="Copy title" description="Copy full title"></copy-button>`
              : nothing
          }
          ${
            record.meta.url
              ? html`<div class="record-url"><bdi>${target ? html`<a tabindex="0" href=${target.href} target="_blank" rel="noopener noreferrer nofollow" title=${record.meta.url}>${this.urlExpanded ? record.meta.url : middle(record.meta.url, 88)}</a>` : this.urlExpanded ? record.meta.url : middle(record.meta.url, 88)}</bdi>${
                  record.meta.url.length > 88
                    ? html`<button type="button" class="text-button" aria-label=${this.urlExpanded ? "Collapse URL" : "Expand URL"} @click=${() => {
                        this.urlExpanded = !this.urlExpanded;
                      }}>…</button>`
                    : nothing
                }</div>`
              : nothing
          }
          <meta-chips .meta=${record.meta}></meta-chips></header><raw-toggle .raw=${this.raw} @raw-change=${this.changeRaw}></raw-toggle>
          ${this.earlierChars ? html`<p class="skipped-text">${number.format(this.earlierChars)} earlier characters. <button type="button" class="text-button" @click=${this.resetWindow}>Read from the start</button></p>` : nothing}
          ${
            this.raw
              ? html`<pre class="raw-record" dir="ltr">${source.slice(this.start, this.end)}</pre>`
              : html`<div class="record-text" dir="auto">${source
                  .slice(this.start, this.end)
                  .split(/\r?\n/)
                  .map((line) => html`<p>${line || "\u00a0"}</p>`)}</div>`
          }
          ${remaining ? html`<span class="reveal-sentinel" aria-hidden="true"></span><div class="reveal-marker"><span>${number.format(remaining)} characters remaining</span><button class="text-button" type="button" @click=${this.reveal}>Read more</button><button class="text-button" type="button" @click=${this.jumpToEnd}>Jump to the end</button></div>` : nothing}
          <span class="text-end"></span><iscc-panel></iscc-panel><technical-details></technical-details>
        `
            : this.pendingView()
        }
      </div></div>
      <nav class="reader-footer" aria-label="Record navigation"><button class="reader-previous" type="button" ?disabled=${!startController().canStep(-1)} @click=${() => startController().step(-1)}>${icon("previous")}<span>Previous</span></button>
        <span class="previous-note">${!stream || stream.from > 0 ? html`Earlier records are unknown until the file is read from the top. <a tabindex="0" href=${routeHash({ kind: "file", file: route.file })}>Read from the top</a>` : nothing}</span>
        <copy-button .value=${record ? link : ""} label="Copy link" description="Copy permanent link"></copy-button><button class="reader-next" type="button" ?disabled=${!startController().canStep(1)} @click=${() => startController().step(1)}><span>${selection?.waitingNext ? "Reading next…" : "Next record"}</span>${icon("next")}</button>
      </nav>
    </section>`;
  }
}
customElements.define("wet-reader", Reader);
