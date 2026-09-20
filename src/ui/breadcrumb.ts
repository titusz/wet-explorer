/** Express the four archive levels with only already-known human labels. */
import { html, nothing } from "lit";
import { routeHash } from "../cc/urls.ts";
import { store } from "../state/store.ts";
import { StoreElement } from "./store-element.ts";

export class Breadcrumb extends StoreElement {
  /** Keep a standalone record independent of the crawl manifest. */
  protected render() {
    const { route, crawls, paths, selection } = store.state;
    if (route.kind === "home" || route.kind === "invalid") return nothing;
    const isFile = route.kind === "file" || route.kind === "record";
    const crawl = isFile ? route.file.crawl : route.crawl;
    const segment = isFile
      ? route.file.segment
      : route.kind === "segment"
        ? route.segment
        : null;
    const pathState = paths.get(crawl);
    const segments =
      pathState?.status === "ready" ? [...pathState.index.segments.keys()] : [];
    const ordinal = segment ? segments.indexOf(segment) : -1;
    const label =
      (crawls.all ?? crawls.recent).find((entry) => entry.id === crawl)
        ?.label ?? crawl;
    const segmentLabel =
      ordinal >= 0
        ? `Segment ${ordinal + 1} of ${segments.length}`
        : segment
          ? `Segment ${segment}`
          : "choosing";
    const level = route.kind === "crawl" ? 2 : route.kind === "segment" ? 3 : 4;
    const steps = [
      { name: "Crawl", label, href: "#/" },
      {
        name: "Segment",
        label: segmentLabel,
        href: routeHash({ kind: "crawl", crawl }),
      },
      {
        name: "File",
        label: isFile
          ? `File ${route.file.file.slice(-5)}`
          : segment
            ? "choosing"
            : "—",
        href: segment ? routeHash({ kind: "segment", crawl, segment }) : null,
      },
      {
        name: "Record",
        label:
          route.kind === "record"
            ? selection?.record?.meta.title || "Permanent link"
            : isFile
              ? "choosing"
              : "—",
        href: isFile
          ? routeHash({
              kind: "file",
              file: route.file,
              ...(store.state.stream?.from
                ? { from: store.state.stream.from }
                : {}),
            })
          : null,
      },
    ];
    const parent =
      steps[
        route.kind === "crawl"
          ? 0
          : route.kind === "segment"
            ? 1
            : route.kind === "file"
              ? 2
              : 3
      ];
    return html`<nav class="archive-breadcrumb" aria-label="Where you are"><ol>${steps.map((step, index) => html`<li class=${index + 1 <= level ? "available" : ""} aria-current=${index + 1 === level ? "step" : nothing}><span class="eyebrow">${index + 1} / ${step.name}</span>${step.href && index < level ? html`<a tabindex="0" href=${step.href} title=${step.label}>${step.label}</a>` : html`<span>${step.label}</span>`}</li>`)}</ol><div class="mobile-breadcrumb"><a tabindex="0" href=${parent?.href ?? "#/"}>← <span>${isFile ? `${label} · File ${route.file.file.slice(-5)}` : route.kind === "segment" ? `${label} · ${segmentLabel}` : label}</span></a><span class="eyebrow" aria-label=${`Step ${level} of 4`}>${level} / 4</span></div></nav>`;
  }
}

customElements.define("wet-breadcrumb", Breadcrumb);
