/** Copy a full value and acknowledge success inside the invoking button. */
import { html, type PropertyValues } from "lit";
import { icon } from "./icons.ts";
import { LightElement } from "./light-element.ts";

export class CopyButton extends LightElement {
  static properties = {
    value: { type: String },
    label: { type: String },
    description: { type: String },
    status: { state: true },
  };
  declare value: string;
  declare label: string;
  declare description: string;
  declare status: string;
  private timer?: ReturnType<typeof setTimeout>;
  private epoch = 0;

  /** Default to a compact copy action suitable for identifier fields. */
  constructor() {
    super();
    this.value = "";
    this.label = "Copy";
    this.description = "";
    this.status = "";
  }

  /** Discard an acknowledgement when navigation replaces the value. */
  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("value")) {
      this.epoch++;
      this.status = "";
      clearTimeout(this.timer);
    }
  }

  /** Keep clipboard errors local and prevent stale success after record navigation. */
  private async copy(): Promise<void> {
    const epoch = this.epoch;
    this.status = "Copying…";
    try {
      await navigator.clipboard.writeText(this.value);
      if (epoch !== this.epoch) return;
      this.status = "Copied";
    } catch {
      if (epoch !== this.epoch) return;
      this.status = "Copy failed";
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.status = "";
    }, 1500);
  }

  /** Release delayed feedback when a view is removed. */
  disconnectedCallback(): void {
    this.epoch++;
    clearTimeout(this.timer);
    super.disconnectedCallback();
  }

  /** Render an explicit accessible action and inline feedback with no toast. */
  protected render() {
    return html`<button type="button" class="copy-button ${this.status ? "has-feedback" : ""}" ?disabled=${!this.value} aria-label=${this.status || this.description || this.label} @click=${this.copy}>${icon(this.status === "Copied" ? "check" : "copy")}<span>${this.status || this.label}</span></button>`;
  }
}
customElements.define("copy-button", CopyButton);
