/** Accept human file references with local feedback and canonical navigation. */
import { html, nothing } from "lit";
import { startController } from "../state/controller.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./store-element.ts";

export class JumpField extends StoreElement {
  static properties = { crawl: { type: String } };
  declare crawl: string;

  /** Initialize the scope used to resolve bare file positions. */
  constructor() {
    super();
    this.crawl = "";
  }

  /** Associate examples and errors with the field rather than a global search concept. */
  protected render() {
    const intent =
      store.state.intent?.kind === "jump" ? store.state.intent : null;
    return html`<form @submit=${this.submit}><label for="file-jump" class="eyebrow">Jump straight to a file</label><div class="jump-controls"><input id="file-jump" name="reference" type="text" placeholder="843" aria-label="File number, file name or link" aria-describedby="jump-hint jump-error" aria-invalid=${Boolean(intent?.error)} autocomplete="off" spellcheck="false"><button type="submit" ?disabled=${intent?.pending}>${intent?.pending ? "Opening…" : "Open"}</button></div><p id="jump-hint">Takes 843, 00843, a full .warc.wet.gz name, a Common Crawl URL or path, an s3://commoncrawl/ URI, or a permanent link from this app.</p><p id="jump-error" class="inline-error" role="status">${intent?.error ?? nothing}</p></form>`;
  }

  /** Preserve entered text after an error and let the controller resolve its scope. */
  private submit(event: SubmitEvent): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget as HTMLFormElement).get(
      "reference",
    );
    startController().jump(typeof value === "string" ? value : "", this.crawl);
  }
}

customElements.define("jump-field", JumpField);
