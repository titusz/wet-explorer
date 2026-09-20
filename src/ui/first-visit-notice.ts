/** Explain raw web content once, with an inline dismissal kept only in this browser. */
import { html, nothing } from "lit";
import { startController } from "../state/controller.ts";
import { store } from "../state/store.ts";
import { icon } from "./icons.ts";
import { StoreElement } from "./store-element.ts";

export class FirstVisitNotice extends StoreElement {
  /** Keep the notice non-modal and let storage restrictions leave it dismissible in memory. */
  protected render() {
    return store.state.prefs.noticeDismissed
      ? nothing
      : html`<aside class="first-notice" aria-label="Raw text notice"><span><span class="wide-copy">These records are raw web text. Nobody has read, filtered or corrected them, here or at Common Crawl.</span><span class="narrow-copy">Raw web text. Nobody has read, filtered or corrected it.</span></span><button type="button" aria-label="Dismiss the raw-text notice" @click=${() => startController().preferences({ noticeDismissed: true })}>${icon("close")}</button></aside>`;
  }
}
customElements.define("first-visit-notice", FirstVisitNotice);
