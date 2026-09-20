/** Group source identifiers and position data without treating remote values as markup. */
import { html, nothing } from "lit";
import { routeHash } from "../cc/urls.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./store-element.ts";
import { middle } from "./text.ts";
import "./copy-button.ts";

/** Offer expansion and copying of the exact value while keeping the closed view compact. */
function identifier(label: string, value: string | null) {
  return html`<div class="identifier-field"><span class="identifier-label">${label}</span><div class="identifier-value"><details><summary title=${value ?? ""}>${value ? middle(value) : "Not provided"}</summary><span class="identifier-expanded">${value ?? "Not provided"}</span></details><copy-button .value=${value ?? ""} .description=${`Copy ${label.toLowerCase()}`}></copy-button></div></div>`;
}

export class TechnicalDetails extends StoreElement {
  /** Keep details collapsed until the reader asks for provenance or exact byte positions. */
  protected render() {
    const { selection, route } = store.state;
    if (!selection?.record || route.kind !== "record") return nothing;
    const meta = selection.record.meta;
    const link = new URL(routeHash(route), location.href).href;
    return html`<details class="technical-details"><summary><span>Technical details</span><small>IDENTITY · SOURCE · POSITION</small></summary><div class="technical-body">
      <section aria-label="Identity"><h2 class="eyebrow">Identity</h2>${identifier("Record ID", meta.recordId)}${identifier("Block digest", meta.digest)}${identifier("Record type", meta.type)}</section>
      <section aria-label="Source"><h2 class="eyebrow">Source</h2>${identifier("Target URL", meta.url)}${identifier("Source record ID", meta.refersTo)}${identifier("Crawl", route.file.crawl)}${identifier("Segment", route.file.segment)}${identifier("WET file", `CC-MAIN-${route.file.file}.warc.wet.gz`)}</section>
      <section aria-label="Position"><h2 class="eyebrow">Position</h2>${identifier("Byte offset and length", `${meta.offset}-${meta.length}`)}${identifier("Record number", meta.index === null ? null : String(meta.index))}${identifier("Permanent link", link)}</section>
      <p class="technical-note">${meta.damaged ? "This record contains damaged text or incomplete source data. The available text is shown as stored. " : ""}Concerned about this page? <a tabindex="0" href="https://commoncrawl.org/faq" target="_blank" rel="noopener noreferrer">Common Crawl contact and opt-out</a>.</p>
    </div></details>`;
  }
}
customElements.define("technical-details", TechnicalDetails);
