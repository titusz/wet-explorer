# Accessibility verification

`tests/e2e/axe.spec.ts` runs all default axe rules against twelve states: landing, expanded older crawls, segments, files, completed stream, empty filter results, reader, raw record, ISCC with technical details, permanent record, record error, and invalid link. Each journey runs in light and dark themes at 1440 and 390 px in Chromium, Firefox and WebKit. Requests use offline fixtures and the real bundled wasm.

Each state retains both violations and incomplete checks as JSON in the browser test artifacts. Any violation fails the test, as does any incomplete check outside the two reviewed cases below. No axe rule or page region is disabled. An automated pass is not a complete WCAG conformance assessment.

## Reviewed incomplete contrast checks

- The fixed mobile random-file action temporarily covers the last recent-crawl row at the initial scroll position. The page has bottom clearance and the row can be scrolled into view. The row uses the same text and background tokens as the audited visible rows. Its title contrast is 14.63:1 in light mode and 15.56:1 in dark mode; its muted count is 5.15:1 and 7.96:1 respectively.
- The mobile breadcrumb contains an arrow next to its text span. Axe classifies the arrow-only text content as needing review. The link uses the action color on the surface background: 7.21:1 in light mode and 6.28:1 in dark mode. Both exceed the 4.5:1 text threshold as well as the 3:1 graphical-control threshold.

Ratios are calculated from the unchanged sRGB design tokens in `src/styles/tokens.css`. All incomplete findings remain in the artifacts so additional cases cannot be mistaken for a reviewed result. Keyboard-only navigation, focus visibility, reduced motion, long text, and right-to-left content have separate functional and visual coverage.
