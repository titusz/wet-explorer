/** Present the crawl landing using the supplied design's markup and tokens. */
import { html, LitElement } from "lit";
import crawls from "../state/landing-crawls.json";

export class WetApp extends LitElement {
  /** Keep global styles compatible with the strict Content Security Policy. */
  protected createRenderRoot(): HTMLElement {
    return this;
  }

  /** Render release metadata bundled at build time without host requests. */
  protected render() {
    const latest = crawls[0];
    if (!latest) return html`<p>No crawls available.</p>`;
    return html`
      <header class="app-header">
        <a class="wordmark" href="#/" aria-label="WET Explorer, ISCC Foundation, home">
          <img src="./iscc-mark.svg" alt="" width="32" height="32" />WET Explorer
        </a>
        <button class="theme-button" type="button" @click=${this.toggleTheme} aria-label="Switch theme">◐</button>
      </header>
      <aside class="first-notice">
        <span>These records are raw web text. Nobody has read, filtered or corrected them, here or at Common Crawl.</span>
      </aside>
      <main class="landing">
        <section class="landing-primary">
          <div class="intro">
            <div class="eyebrow">01 / Crawl</div>
            <h1>Read the text that Common Crawl actually stores.</h1>
            <p>Pick a month, open one file, and read the extracted text of real web pages. The file streams from Common Crawl straight into this tab. There is no server of ours in between, and no index.</p>
          </div>
          <section class="crawl-card" aria-label="Selected crawl">
            <div class="eyebrow">${latest.id}</div>
            <h2>${latest.label}</h2>
            <div class="crawl-numbers">
              <div><strong>${(latest.pages / 1e9).toFixed(2)} billion</strong><span>pages</span></div>
              <div><strong>${latest.files?.toLocaleString("en")}</strong><span>files</span></div>
              <div><strong>${latest.wetTiB?.toFixed(2)} TiB</strong><span>on disk</span></div>
            </div>
          </section>
          <div class="landing-actions">
            <a class="primary-action" href="#/c/${latest.id}">Open a random file</a>
            <div class="action-caption"><span>Every file is an arbitrary shard, so a random one is as representative as any.</span><a href="#/c/${latest.id}">Choose a file yourself</a></div>
          </div>
        </section>
        <aside class="crawl-sidebar">
          <div class="eyebrow">Recent crawls</div>
          <div class="crawl-list">${crawls.map(
            (crawl, i) => html`
            <a class="crawl-option ${i === 0 ? "selected" : ""}" href="#/c/${crawl.id}">
              <span>${crawl.label}</span><small>${(crawl.pages / 1e9).toFixed(2)} billion pages</small>
            </a>`,
          )}
          </div>
        </aside>
      </main>
      <footer class="app-footer">
        <img class="foundation-logo" src="./iscc-foundation.svg" alt="ISCC Foundation" width="243" height="90" />
        <div><p>Text records come from <a href="https://commoncrawl.org">Common Crawl</a> and are read directly from their public file host. Nothing is stored or moderated here.</p><a href="https://commoncrawl.org/terms-of-use">Common Crawl terms of use</a></div>
        <nav aria-label="About"><a href="https://iscc.io">ISCC Foundation</a><a href="https://github.com/titusz/wet-explorer">Source code</a><span class="eyebrow">ISO 24138:2024</span></nav>
      </footer>`;
  }

  /** Toggle the manual theme relative to the effective system setting. */
  private toggleTheme(): void {
    const current = document.documentElement.dataset.theme;
    const dark =
      current === "dark" ||
      (!current && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "light" : "dark";
  }
}

customElements.define("wet-app", WetApp);
