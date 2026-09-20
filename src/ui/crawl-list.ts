/** Present six recent months and progressively expanded older year groups. */
import { html, nothing } from "lit";
import type { Crawl } from "../state/catalogue.ts";
import { startController } from "../state/controller.ts";
import years from "../state/crawl-years.json";
import { store } from "../state/store.ts";
import { icon } from "./icons.ts";
import { StoreElement } from "./store-element.ts";

/** Keep crawl selection identical in the recent list and expanded years. */
function crawlOption(crawl: Crawl) {
  return html`<button class="crawl-option ${store.state.crawls.selected === crawl.id ? "selected" : ""}" type="button" aria-pressed=${store.state.crawls.selected === crawl.id} @click=${() => startController().chooseCrawl(crawl.id)}><span>${crawl.label}</span><small>${(crawl.pages / 1e9).toFixed(2)} billion pages</small></button>`;
}

export class YearGroup extends StoreElement {
  static properties = { year: { type: Number }, count: { type: Number } };
  declare year: number;
  declare count: number;

  /** Initialize reactive year metadata through Lit's property accessors. */
  constructor() {
    super();
    this.year = 0;
    this.count = 0;
  }

  /** Fetch the static list only on expansion, retaining a visible retry on failure. */
  protected render() {
    const { crawls } = store.state;
    const recent = new Set(crawls.recent.map((crawl) => crawl.id));
    const entries =
      crawls.all?.filter(
        (crawl) => crawl.year === this.year && !recent.has(crawl.id),
      ) ?? [];
    return html`<details class="year-group" @toggle=${this.expand}><summary>${icon("next")}<span>${this.year}</span><small>${this.count} ${this.count === 1 ? "crawl" : "crawls"}</small></summary><div class="year-months">${crawls.status === "error" ? html`<p role="status">The older crawl list could not be loaded.</p><button type="button" @click=${() => startController().olderCrawls()}>Try again</button>` : entries.length ? entries.map(crawlOption) : html`<p role="status">Loading crawls…</p>`}</div></details>`;
  }

  /** Opening a year is the only automatic trigger for the optional catalogue. */
  private expand(event: Event): void {
    if ((event.currentTarget as HTMLDetailsElement).open)
      void startController().olderCrawls();
  }
}

export class CrawlList extends StoreElement {
  /** Fold distant years once more so the sidebar never becomes an ungrouped archive. */
  protected render() {
    const first = years.slice(0, 4);
    const middle = years.slice(4, -1);
    const oldest = years.length > 4 ? years.at(-1) : undefined;
    return html`<div class="eyebrow">Recent crawls</div><div class="crawl-list" aria-label="Recent crawls">${store.state.crawls.recent.map(crawlOption)}</div><div class="eyebrow older-label">Earlier, by year</div>${first.map((year) => html`<year-group .year=${year.year} .count=${year.count}></year-group>`)}${middle.length ? html`<details class="earlier-years"><summary>${icon("next")}<span>${middle[0]?.year} to ${middle.at(-1)?.year}</span><small>${middle.reduce((sum, year) => sum + year.count, 0)} crawls</small></summary>${middle.map((year) => html`<year-group .year=${year.year} .count=${year.count}></year-group>`)}</details>` : nothing}${oldest ? html`<year-group .year=${oldest.year} .count=${oldest.count}></year-group>` : nothing}`;
  }
}

customElements.define("year-group", YearGroup);
customElements.define("crawl-list", CrawlList);
