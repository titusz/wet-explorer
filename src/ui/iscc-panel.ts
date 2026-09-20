/** Request the open record's Text-Code only after paint and near the reader viewport. */
import { html, nothing } from "lit";
import { startController } from "../state/controller.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./store-element.ts";
import "./copy-button.ts";

export class IsccPanel extends StoreElement {
  private observer?: IntersectionObserver;
  private near = false;
  private frame: number | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private restoreFocus = false;

  /** Observe the actual scrolling article, including a small approach margin. */
  protected firstUpdated(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        this.near = entries.some((entry) => entry.isIntersecting);
        this.queueCompute();
      },
      { root: this.closest(".reader-scroll"), rootMargin: "150px" },
    );
    this.observer.observe(this);
  }

  /** A replacement record may arrive while the same panel remains near the viewport. */
  protected updated(): void {
    const state = store.state.selection?.iscc?.state;
    if (this.restoreFocus && state !== "computing") {
      const requestId = store.state.selection?.requestId;
      requestAnimationFrame(() => {
        if (
          this.isConnected &&
          store.state.selection?.requestId === requestId &&
          document.activeElement === document.body
        )
          this.querySelector<HTMLButtonElement>("button")?.focus({
            preventScroll: true,
          });
      });
      this.restoreFocus = false;
    }
    this.queueCompute();
  }

  /** Give record text a paint opportunity before loading or messaging the separate worker. */
  private queueCompute(): void {
    const selection = store.state.selection;
    if (
      !this.near ||
      !selection?.record ||
      this.frame !== null ||
      this.timer !== undefined ||
      (selection.iscc &&
        (selection.iscc.state !== "idle" || selection.iscc.error))
    )
      return;
    const requestId = selection.requestId;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        if (store.state.selection?.requestId !== requestId) {
          this.queueCompute();
          return;
        }
        if (this.near && this.isConnected)
          startController().computeIscc(requestId);
      }, 0);
    });
  }

  /** Restore the manual action's focus after its result replaces the button. */
  private compute(): void {
    const requestId = store.state.selection?.requestId;
    if (requestId === undefined) return;
    this.restoreFocus = true;
    startController().computeIscc(requestId);
  }

  /** Release observation and queued work when navigation removes the reader. */
  disconnectedCallback(): void {
    this.observer?.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    clearTimeout(this.timer);
    super.disconnectedCallback();
  }

  /** Keep computation, copying, and a recoverable failure inside the compact panel. */
  protected render() {
    const selection = store.state.selection;
    if (!selection?.record) return nothing;
    const state = selection.iscc ?? { state: "idle" as const };
    return html`<section class="iscc-panel" aria-label="ISCC Text-Code" data-state=${state.state}>
      <h2 class="iscc-label"><span aria-hidden="true"></span>ISCC Text-Code</h2>
      ${
        state.state === "ready"
          ? html`<div class="iscc-code-row"><code class="iscc-code" dir="ltr" title=${state.code}>${state.code}</code><copy-button .value=${state.code} label="Copy" description="Copy ISCC Text-Code"></copy-button></div>`
          : state.state === "computing"
            ? html`<div class="iscc-computing" role="status"><span>Computing</span><span class="iscc-busy-track" role="progressbar" aria-label="Computing ISCC Text-Code"><span></span></span></div>`
            : html`<div class="iscc-idle"><p role=${state.error ? "status" : nothing}>${state.error ? "The code could not be computed. You can still read the record." : "Not computed yet. It is derived from the text above, in this browser."}</p><button type="button" class="secondary-action" @click=${this.compute}>${state.error ? "Try again" : "Compute"}</button></div>`
      }
      ${state.state === "ready" ? html`<p class="iscc-note">256-bit Text-Code, ISO 24138:2024. Derived from the text above without leaving this tab.</p>` : nothing}
    </section>`;
  }
}

customElements.define("iscc-panel", IsccPanel);
