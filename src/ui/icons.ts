/** Reuse the small control glyphs supplied in the design hand-off. */
import { html, nothing, svg } from "lit";

const paths = {
  copy: "M5 15V5a1 1 0 0 1 1-1h9",
  previous: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  check: "M5 12l4 4L19 6",
  close: "M5 5l14 14M19 5L5 19",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z",
  sun: "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  shuffle:
    "M4 6h3l10 12h3M4 18h3l3-3.6M14 8.6L17 6h3M17 3l3 3-3 3M17 15l3 3-3 3",
};

/** Render a decorative SVG whose containing control supplies its accessible name. */
export function icon(name: keyof typeof paths) {
  return html`<svg class="ui-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${name === "copy" ? svg`<rect x="9" y="9" width="11" height="11"></rect>` : name === "sun" ? svg`<circle cx="12" cy="12" r="4"></circle>` : nothing}<path d=${paths[name]}></path></svg>`;
}
