/** Render manifest-backed segment grids and mobile ranges of one hundred files. */
import { html, nothing } from "lit";
import type { FileRef } from "../cc/urls.ts";
import { filePath, routeHash } from "../cc/urls.ts";
import { startController } from "../state/controller.ts";
import { visitFraction } from "../state/persistence.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./store-element.ts";
import "./jump-field.ts";
import "./random-file.ts";

export class SegmentGrid extends StoreElement {
  static properties = {
    crawl: { type: String },
    segments: { attribute: false },
  };
  declare crawl: string;
  declare segments: [string, FileRef[]][];

  /** Initialize reactive inputs without shadowing Lit's property accessors. */
  constructor() {
    super();
    this.crawl = "";
    this.segments = [];
  }

  /** Use manifest order for ordinal labels without giving shards invented meaning. */
  protected render() {
    return html`<div class="segment-grid" aria-label="Segments">${this.segments.map(([segment, files], index) => this.cell(segment, files, index))}</div>`;
  }

  /** Shade the fraction of files opened, without claiming a segment byte total. */
  private cell(segment: string, files: FileRef[], index: number) {
    const visited = files.filter(
      (file) => store.state.prefs.visited[filePath(file)],
    ).length;
    return html`<a tabindex="0" class="segment-cell" href=${routeHash({ kind: "segment", crawl: this.crawl, segment })} aria-label=${`Segment ${index + 1} of ${this.segments.length}, ${files.length.toLocaleString("en")} files${visited ? `, ${visited} opened` : ""}`} title=${segment}>${visited ? html`<progress class="visit-fill" aria-hidden="true" max=${files.length} value=${visited}></progress>` : nothing}<span class="cell-label">${String(index + 1).padStart(2, "0")}</span><small>${files.length.toLocaleString("en")} files</small></a>`;
  }
}

export class FileGrid extends StoreElement {
  static properties = {
    files: { attribute: false },
    mobile: { state: true },
    range: { state: true },
    columns: { state: true },
  };
  declare files: FileRef[];
  declare private mobile: boolean;
  declare private range: number;
  declare private columns: number;
  private media: MediaQueryList | null = null;
  private wide: MediaQueryList | null = null;

  /** Initialize the responsive grid and its collapsed range selection. */
  constructor() {
    super();
    this.files = [];
    this.mobile = false;
    this.range = -1;
    this.columns = 40;
  }

  /** Keep the mobile grid bounded to the active range, including after a resize. */
  connectedCallback(): void {
    super.connectedCallback();
    this.media = matchMedia("(max-width: 767px)");
    this.wide = matchMedia("(min-width: 1280px)");
    this.resize();
    this.media.addEventListener("change", this.resize);
    this.wide.addEventListener("change", this.resize);
  }

  /** Release the viewport subscription with the picker. */
  disconnectedCallback(): void {
    this.media?.removeEventListener("change", this.resize);
    this.wide?.removeEventListener("change", this.resize);
    super.disconnectedCallback();
  }

  /** Choose the appropriate grid without retaining hidden desktop file cells. */
  private resize = (): void => {
    this.mobile = this.media?.matches ?? false;
    this.columns = this.wide?.matches ? 40 : 25;
  };

  /** Keep desktop dense while mobile reveals only the hundred the visitor expands. */
  protected render() {
    if (!this.mobile) {
      const rows = Array.from(
        { length: Math.ceil(this.files.length / this.columns) },
        (_, i) => this.files.slice(i * this.columns, (i + 1) * this.columns),
      );
      return html`<div class="desktop-files" aria-label="Files">${rows.map((files) => html`<div class="file-grid-row"><span class="file-row-label" aria-hidden="true">${files[0]?.file.slice(-5)}</span><div class="file-grid">${files.map((file) => this.cell(file))}</div></div>`)}</div>`;
    }
    const ranges = Array.from(
      { length: Math.ceil(this.files.length / 100) },
      (_, i) => this.files.slice(i * 100, (i + 1) * 100),
    );
    return html`<div class="mobile-files" aria-label="File ranges">${ranges.map((files, i) => html`<details name="file-range" class="file-range" @toggle=${(event: Event) => this.toggleRange(event, i)}><summary><span>${files[0]?.file.slice(-5)} – ${files.at(-1)?.file.slice(-5)}</span><span aria-hidden="true">›</span></summary>${this.range === i ? html`<div class="file-grid" aria-label=${`Files ${i * 100} to ${i * 100 + files.length - 1}`}>${files.map((file) => this.cell(file))}</div>` : nothing}</details>`)}</div>`;
  }

  /** Native disclosure controls select a hundred without changing the archive route. */
  private toggleRange(event: Event, index: number): void {
    if ((event.currentTarget as HTMLDetailsElement).open) this.range = index;
    else if (this.range === index) this.range = -1;
  }

  /** Keep the canonical full name on hover and a unique accessible cell label. */
  private cell(file: FileRef) {
    const visit = store.state.prefs.visited[filePath(file)];
    const fraction = visit ? visitFraction(visit) : null;
    return html`<a tabindex="0" class="file-cell" href=${routeHash({ kind: "file", file })} aria-label=${`File ${file.file.slice(-5)}`} title=${`CC-MAIN-${file.file}.warc.wet.gz${visit ? (fraction === null ? " · opened before" : ` · ${Math.floor(fraction * 100)}% read`) : ""}`} data-visited=${Boolean(visit)}>${visit ? (fraction === null ? html`<span class="visited-dot" aria-hidden="true"></span>` : html`<progress class="visit-fill" aria-hidden="true" max="1" value=${fraction}></progress>`) : nothing}<span class="cell-label">${file.file.slice(-5)}</span></a>`;
  }
}

export class WetPicker extends StoreElement {
  /** Give loading, unavailable manifests and missing segments their own recoverable view. */
  protected render() {
    const { route, paths } = store.state;
    if (route.kind !== "crawl" && route.kind !== "segment") return nothing;
    const pathState = paths.get(route.crawl);
    const index = pathState?.status === "ready" ? pathState.index : null;
    const files =
      route.kind === "segment" ? index?.segments.get(route.segment) : null;
    const ordinal =
      route.kind === "segment" && index
        ? [...index.segments.keys()].indexOf(route.segment) + 1
        : 0;
    const title =
      route.kind === "crawl"
        ? "Pick a segment"
        : files
          ? `${files.length.toLocaleString("en")} files in segment ${ordinal}`
          : "Pick a file";
    return html`<main class="picker"><div class="picker-heading"><div class="eyebrow">${route.kind === "crawl" ? "02 / Segment" : "03 / File"}</div><h1>${title}</h1><p>${route.kind === "crawl" ? "Arbitrary shards. Which one you take does not change what you find, because every file is a random sample of the whole crawl." : html`<span class="wide-copy">Each file is an arbitrary shard. Cells fill up as you read them.</span><span class="narrow-copy">Pick a hundred first, then a file.</span>`}</p></div><div class="picker-body ${route.kind === "segment" ? "picking-file" : ""}"><div class="picker-grid">${pathState?.status === "error" ? html`<section class="picker-error" role="status"><h2>The file list could not be loaded.</h2><p>Common Crawl may be unavailable, or this crawl may use an unsupported file format.</p><button class="secondary-action" type="button" @click=${() => startController().ensurePaths(route.crawl, true)}>Try again</button><a tabindex="0" href="#/">Choose another crawl</a></section>` : !index ? html`<div class="grid-skeleton" role="status" aria-label="Loading the file list">${Array.from({ length: 100 }, () => html`<span></span>`)}</div>` : route.kind === "crawl" ? html`<segment-grid .crawl=${route.crawl} .segments=${[...index.segments]}></segment-grid>` : files ? html`<file-grid .files=${files}></file-grid>` : html`<section class="picker-error" role="status"><h2>This segment is not in the crawl.</h2><a tabindex="0" href=${routeHash({ kind: "crawl", crawl: route.crawl })}>Choose a segment</a></section>`}</div><aside class="picker-tools"><jump-field .crawl=${route.crawl}></jump-field><div class="visit-legend" aria-label="File shading"><span><i class="opened-swatch" aria-hidden="true"></i>Opened before</span><span><i aria-hidden="true"></i>Not opened</span></div>${route.kind === "crawl" ? html`<p class="shard-explanation">A WET file has no table of contents. Records can only be discovered by reading it, so filtering is available once records arrive.</p>` : nothing}<random-file .crawl=${route.crawl}></random-file></aside></div></main>`;
  }
}

customElements.define("segment-grid", SegmentGrid);
customElements.define("file-grid", FileGrid);
customElements.define("wet-picker", WetPicker);
