/** Offer recovery from an unavailable manifest or a missing segment. */
import { html } from "lit";
import { routeHash } from "../cc/urls.ts";
import { startController } from "../state/controller.ts";
import { LightElement } from "./light-element.ts";

export class ErrorState extends LightElement {
  static properties = {
    crawl: { type: String },
    missingSegment: { type: Boolean },
  };
  declare crawl: string;
  declare missingSegment: boolean;

  /** Initialize the archive context without shadowing Lit's property accessors. */
  constructor() {
    super();
    this.crawl = "";
    this.missingSegment = false;
  }

  /** Preserve local recovery links and retry only on an explicit action. */
  protected render() {
    if (this.missingSegment)
      return html`<section class="picker-error" role="status"><h2>This segment is not in the crawl.</h2><a tabindex="0" href=${routeHash({ kind: "crawl", crawl: this.crawl })}>Choose a segment</a></section>`;
    return html`<section class="picker-error" role="status"><h2>The file list could not be loaded.</h2><p>Common Crawl may be unavailable, or this crawl may use an unsupported file format.</p><button class="secondary-action" type="button" @click=${() => startController().ensurePaths(this.crawl, true)}>Try again</button><a tabindex="0" href="#/">Choose another crawl</a></section>`;
  }
}
customElements.define("error-state", ErrorState);
