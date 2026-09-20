/** Apply global design styles to Lit components without inline shadow stylesheets. */
import { LitElement } from "lit";

export class LightElement extends LitElement {
  /** Keep component markup in the document's accessible and styled DOM tree. */
  protected createRenderRoot(): HTMLElement {
    return this;
  }
}
