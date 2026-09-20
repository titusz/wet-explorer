/** Subscribe light-DOM components to application state under the strict style policy. */
import { store } from "../state/store.ts";
import { LightElement } from "./light-element.ts";

export class StoreElement extends LightElement {
  private unsubscribe?: () => void;

  /** Render changed store slices while the component is connected. */
  connectedCallback(): void {
    super.connectedCallback();
    this.unsubscribe = store.subscribe(() => this.requestUpdate());
  }

  /** Release the subscription when navigation removes this view. */
  disconnectedCallback(): void {
    this.unsubscribe?.();
    super.disconnectedCallback();
  }
}
