/** Present archive navigation and reading within the supplied application shell. */
import { html, nothing } from "lit";
import { routeHash } from "../cc/urls.ts";
import { startController } from "../state/controller.ts";
import { store } from "../state/store.ts";
import { icon } from "./icons.ts";
import { StoreElement } from "./store-element.ts";
import "./record-stream.ts";
import "./reader.ts";
import "./crawl-list.ts";
import "./random-file.ts";
import "./breadcrumb.ts";
import "./pickers.ts";
import "./first-visit-notice.ts";
import "./return-position.ts";

/** Focus the local record filter after its list becomes visible. */
function focusFilter(): void {
  document.querySelector<HTMLInputElement>("#record-filter")?.focus();
}

export class WetApp extends StoreElement {
  /** Make the random-file shortcut available throughout archive navigation. */
  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("keydown", this.shortcut);
  }

  /** Release the document-level shortcut when the application is removed. */
  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.shortcut);
    super.disconnectedCallback();
  }

  /** Ignore typing and browser shortcuts while accepting the documented R action. */
  private shortcut = (event: KeyboardEvent): void => {
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      (event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable=true]"))
    )
      return;
    const { route, crawls } = store.state;
    if (route.kind === "invalid") return;
    if (event.key === "/" && store.state.stream) {
      event.preventDefault();
      if (route.kind === "record") {
        addEventListener(
          "hashchange",
          () => requestAnimationFrame(focusFilter),
          { once: true },
        );
        location.hash = routeHash({
          kind: "file",
          file: route.file,
          from: store.state.stream.from,
        });
      } else focusFilter();
      return;
    }
    if (event.key.toLowerCase() !== "r") return;
    event.preventDefault();
    startController().random(
      route.kind === "file" || route.kind === "record"
        ? route.file.crawl
        : route.kind === "crawl" || route.kind === "segment"
          ? route.crawl
          : crawls.selected,
    );
  };

  /** Keep global styles compatible with the strict Content Security Policy. */
  protected createRenderRoot(): HTMLElement {
    return this;
  }

  /** Render release metadata bundled at build time without host requests. */
  protected render() {
    const { route } = store.state;
    if (route.kind === "file" || route.kind === "record")
      return this.renderStream();
    if (route.kind === "invalid")
      return html`${this.renderHeader()}<main class="picker"><section class="picker-error"><h1>This link was not understood.</h1><p>Check the link or choose a crawl to start reading.</p><a tabindex="0" class="secondary-action" href="#/">Choose a crawl</a></section></main>`;
    if (route.kind === "crawl" || route.kind === "segment")
      return html`${this.renderHeader()}<wet-breadcrumb></wet-breadcrumb><wet-picker></wet-picker>${this.renderFooter(true)}`;
    const { crawls, paths } = store.state;
    const latest =
      (crawls.all ?? crawls.recent).find(
        (crawl) => crawl.id === crawls.selected,
      ) ?? crawls.recent[0];
    if (!latest) return html`<p>No crawls available.</p>`;
    const manifest = paths.get(latest.id);
    const files =
      manifest?.status === "ready" ? manifest.index.files.length : latest.files;
    return html`
      ${this.renderHeader()}
      <first-visit-notice></first-visit-notice>
      <main class="landing">
        <section class="landing-primary">
          <div class="intro">
            <div class="eyebrow">01 / Crawl</div>
            <h1>Read the text that Common Crawl actually stores.</h1>
            <p><span class="wide-copy">Pick a month, open one file, and read the extracted text of real web pages. The file streams from Common Crawl straight into this tab. There is no server of ours in between, and no index.</span><span class="narrow-copy">Pick a month, open one file, and read the extracted text of real web pages, streamed straight into this tab.</span></p>
          </div>
          <section class="crawl-card" aria-label="Selected crawl">
            <div class="eyebrow">${latest.id}</div>
            <h2>${latest.label}</h2>
            <div class="crawl-numbers">
              <div><strong>${(latest.pages / 1e9).toFixed(2)} billion</strong><span>pages</span></div>
              <div><strong>${files?.toLocaleString("en") ?? "—"}</strong><span>files</span></div>
              <div><strong>${latest.wetTiB ? `${latest.wetTiB.toFixed(2)} TiB` : "—"}</strong><span>on disk</span></div>
            </div>
          </section>
          <div class="landing-actions">
            <random-file .crawl=${latest.id} primary></random-file>
            <div class="action-caption"><span>Every file is an arbitrary shard, so a random one is as representative as any.</span><a tabindex="0" href="#/c/${latest.id}">Choose a file yourself</a></div>
          </div>
          <return-position></return-position>
        </section>
        <aside class="crawl-sidebar" aria-label="Crawl selection"><crawl-list></crawl-list></aside>
      </main>
      ${this.renderFooter()}`;
  }

  /** Keep the logo and manual theme control identical across all four levels. */
  private renderHeader() {
    const { route } = store.state;
    const crawl =
      route.kind === "file" || route.kind === "record"
        ? route.file.crawl
        : route.kind === "crawl" || route.kind === "segment"
          ? route.crawl
          : null;
    return html`<header class="app-header"><a tabindex="0" class="wordmark" href="#/" aria-label="WET Explorer, ISCC Foundation, home"><img src="./iscc-mark.svg" alt="" width="32" height="32" />WET Explorer</a>${crawl ? html`<span class="header-crawl">${crawl}</span>` : nothing}<button class="theme-button" type="button" @click=${this.toggleTheme} aria-label="Switch theme"><span class="light-logo">${icon("moon")}</span><span class="dark-logo">${icon("sun")}</span></button></header>`;
  }

  /** Credit the data and publisher without introducing remote runtime assets. */
  private renderFooter(compact = false) {
    if (compact)
      return html`<footer class="compact-footer"><span>Data: <a tabindex="0" href="https://commoncrawl.org">Common Crawl</a></span><a tabindex="0" href="https://commoncrawl.org/terms-of-use">Terms of use</a><a tabindex="0" href="https://iscc.io">ISCC Foundation</a><a tabindex="0" href="https://github.com/titusz/wet-explorer">Source code</a></footer>`;
    return html`
      <footer class="app-footer">
        <img class="foundation-logo light-logo" src="./iscc-foundation.svg" alt="ISCC Foundation" width="243" height="90" /><img class="foundation-logo dark-logo" src="./iscc-foundation-dark.svg" alt="ISCC Foundation" width="243" height="90" />
        <div><p>Text records come from <a tabindex="0" href="https://commoncrawl.org">Common Crawl</a> and are read directly from their public file host. Nothing is stored or moderated here.</p><a tabindex="0" href="https://commoncrawl.org/terms-of-use">Common Crawl terms of use</a></div>
        <nav aria-label="About"><a tabindex="0" href="https://iscc.io">ISCC Foundation</a><a tabindex="0" href="https://github.com/titusz/wet-explorer">Source code</a><span class="eyebrow">ISO 24138:2024</span></nav>
      </footer>`;
  }

  /** Present the stream and reader pane within the shared application shell. */
  private renderStream() {
    const { route, intent } = store.state;
    if (route.kind !== "file" && route.kind !== "record") return;
    return html`
      ${this.renderHeader()}<wet-breadcrumb></wet-breadcrumb>
      ${route.kind === "record" && (!store.state.stream || store.state.stream.from > 0) ? html`<aside class="permalink-context"><span class="context-mark" aria-hidden="true"></span><p><span class="wide-copy">Opened from a permanent link. Records before this one are unknown until the file is read from the top.</span><span class="narrow-copy">Earlier records have not been read.</span></p><a tabindex="0" class="secondary-action" href=${routeHash({ kind: "file", file: route.file })}>Read this file from the start</a></aside>` : nothing}
      ${intent?.kind === "random" ? html`<aside class="navigation-status" role="status">${intent.pending ? "Loading the file list…" : html`${intent.error} <button type="button" class="compact-button" @click=${() => startController().random(route.file.crawl)}>Try again</button>`}</aside>` : nothing}
      <main class="stream-layout ${route.kind === "record" ? "has-record" : ""} ${!store.state.stream ? "standalone" : ""}">${store.state.stream ? html`<record-stream></record-stream>` : nothing}<wet-reader></wet-reader></main>${this.renderFooter(true)}`;
  }

  /** Toggle the manual theme relative to the effective system setting. */
  private toggleTheme(): void {
    const current = document.documentElement.dataset.theme;
    const dark =
      current === "dark" ||
      (!current && matchMedia("(prefers-color-scheme: dark)").matches);
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    startController().preferences({ theme });
  }
}

customElements.define("wet-app", WetApp);
