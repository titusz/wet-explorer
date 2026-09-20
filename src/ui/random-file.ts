/** Share the explicit random-file action and its small manifest-loading state. */
import { html, nothing } from "lit";
import { startController } from "../state/controller.ts";
import { store } from "../state/store.ts";
import { icon } from "./icons.ts";
import { StoreElement } from "./store-element.ts";

export class RandomFile extends StoreElement {
  static properties = { crawl: { type: String }, primary: { type: Boolean } };
  declare crawl: string;
  declare primary: boolean;

  /** Initialize the shared action for its containing crawl. */
  constructor() {
    super();
    this.crawl = "";
    this.primary = false;
  }

  /** Start intent prefetch only near the primary action or when it receives focus. */
  protected render() {
    const intent = store.state.intent;
    const pending = intent?.kind === "random" && intent.pending;
    return html`<div class="random-intent" @pointerenter=${this.prefetch} @focusin=${this.prefetch}><button type="button" class=${this.primary ? "primary-action" : "secondary-action"} ?disabled=${pending} @click=${() => startController().random(this.crawl)}>${pending ? "Loading the file list…" : html`${icon("shuffle")}<span>Open a random file</span>`}</button></div>${intent?.kind === "random" && intent.error ? html`<p class="inline-error" role="status">${intent.error}</p>` : nothing}`;
  }

  /** Hovering never fetches a WET file and never interrupts an existing stream. */
  private prefetch(): void {
    if (this.primary && !store.state.stream)
      startController().ensurePaths(this.crawl);
  }
}

customElements.define("random-file", RandomFile);
