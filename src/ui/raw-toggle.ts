/** Switch between the reader presentation and literal raw record text. */
import { html } from "lit";
import { LightElement } from "./light-element.ts";

export class RawToggle extends LightElement {
  static properties = { raw: { type: Boolean } };
  declare raw: boolean;

  /** Announce a view intent without owning the reader's state. */
  private change(raw: boolean): void {
    this.dispatchEvent(
      new CustomEvent("raw-change", { detail: raw, bubbles: true }),
    );
  }

  /** Keep both presentations reachable through ordinary keyboard buttons. */
  protected render() {
    return html`<div class="raw-toggle" role="group" aria-label="Record presentation"><button type="button" aria-pressed=${!this.raw} @click=${() => this.change(false)}>Reader</button><button type="button" aria-pressed=${!!this.raw} @click=${() => this.change(true)}>Raw</button></div>`;
  }
}
customElements.define("raw-toggle", RawToggle);
