/** Explain the scope of an empty metadata filter and offer a local reset. */
import { html } from "lit";
import { startController } from "../state/controller.ts";
import { emptyFilters } from "../state/filters.ts";
import { LightElement } from "./light-element.ts";

export class EmptyState extends LightElement {
  static properties = { scope: { type: String } };
  declare scope: string;

  /** Initialize the description without shadowing Lit's property accessor. */
  constructor() {
    super();
    this.scope = "";
  }

  /** Keep the observed record count and playback state visible with the recovery action. */
  protected render() {
    return html`<div class="list-message" role="status">No matches in ${this.scope}. <button type="button" class="clear-filter" @click=${() => startController().filter(emptyFilters())}>Clear filters</button></div>`;
  }
}
customElements.define("empty-state", EmptyState);
