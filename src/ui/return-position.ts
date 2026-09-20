/** Offer the last readable position using records observed and honest byte progress. */
import { html, nothing } from "lit";
import { filePath, parseRoute } from "../cc/urls.ts";
import { visitFraction } from "../state/persistence.ts";
import { store } from "../state/store.ts";
import { number } from "./format.ts";
import { StoreElement } from "./store-element.ts";

export class ReturnPosition extends StoreElement {
  /** A direct-record visit without a file read claims only its known byte position. */
  protected render() {
    const last = store.state.prefs.last;
    if (!last) return nothing;
    const route = parseRoute(last.route);
    if (route.kind !== "file" && route.kind !== "record") return nothing;
    const visit = store.state.prefs.visited[filePath(route.file)];
    const fraction = visit ? visitFraction(visit) : null;
    return html`<section class="return-position" aria-label="Continue where you left off"><div><h2>Continue where you left off</h2><p>${route.file.crawl} · file ${route.file.file.slice(-5)} · ${visit ? `${number.format(visit.rows)} records${visit.from ? " in the last read" : ""}${fraction === null ? "" : ` · ${Math.floor(fraction * 100)}% of file read`}` : route.kind === "record" ? `Record at byte ${number.format(route.offset)}` : "Saved reading position"}</p></div><a tabindex="0" class="secondary-action" href=${last.route}>Continue</a>${fraction === null ? nothing : html`<progress aria-label="File bytes read at the saved position" max="1" value=${fraction}></progress>`}</section>`;
  }
}
customElements.define("return-position", ReturnPosition);
