# Visual verification

`tests/e2e/visual.spec.ts` compares seven views in light and dark themes at 1440 × 1000 and 390 × 844: landing, segment picker, file picker, stream, selected record, standalone permanent link, and returning visitor. Each operating system has 28 PNG baselines in `tests/e2e/visual.spec.ts-snapshots/`. The returning-visitor fixture contains only invented progress metadata: 7,840 records and 24,320,000 of 64,000,000 bytes traversed.

The supplied hand-off's 18 desktop/mobile boards were rendered locally with their bundled fonts and artwork, without remote assets. Their typography, colors, spacing, controls and responsive behavior were compared with the application captures. The permanent-link reference is 1240 px tall; the regression suite uses a consistent 1000 px desktop viewport and exercises the scrolling reader separately.

The application retains the supplied design tokens, Readex Pro and JetBrains Mono subsets, 680 px article measure, 17/27 px body text, 52 px record rows, dense desktop file grid, and mobile ranges of one hundred files. Desktop file cells fit above the compact footer at the reference width. Mobile primary actions remain fixed at the bottom with 52 px targets. The resume strip uses the approved records-plus-byte copy and a byte-progress bar.

## Explained differences from the illustrations

| Difference | Reason |
| --- | --- |
| Crawl dates and archive statistics | The app offers 91 compatible crawls from May 2017 onward, using the approved filename boundary and checked-in source catalogue. A short note explains the range. Six recent crawls remain available; four are visible above the bottom action at 390 px. |
| Three segments, and neutral unvisited cells | The recorded manifest fixture has 2,500 lines across three segments. A fresh session has no visit history; it must not invent selected or visited cells. The legend describes actual opened/unopened state. |
| No estimated record count for a file or saved position | The brief prohibits a total before EOF. Titusz approved “7,840 records · 38% of file read.” |
| Different record titles, languages and text | Captures use the byte-exact recorded fixture, including all its language chips and original page boilerplate. They do not substitute the hand-off's invented shortwave-receiver article. |
| Completed stream with 49 records and an EOF summary | The bounded fixture contains one warcinfo member and 49 text records. Reading, waiting, pause and interruption have separate behavioral tests. |
| Three local filter controls | The brief requires title/host, language and optional short-record filtering. They remain usable on mobile. |
| Reader/Raw control on mobile | Exact source access remains available on the small screen, even though the compact mobile illustration omits that control. |
| Four-step breadcrumb numbering | The indicator follows the actual crawl, segment, file and record hierarchy. A standalone link uses its known identifiers without fetching a manifest for an ordinal label. |
| Focus outline on a directly opened record heading | Programmatic focus gives keyboard and assistive-technology users a destination after navigation. The screenshot keeps that state visible. |
| Standalone-link explanation on mobile | Earlier records are unknown. The compact banner exposes the same explicit read-from-start action as the desktop view. |
| 256-bit ISCC caption and wrapping code | The mechanism and reference code in the plan require 256 bits. The design's shorter 64-bit illustration cannot describe that value accurately. The entire computed code remains visible and copyable at 390 px. |

`iscc-visual.spec.ts` adds 16 screenshots per operating system: idle, computing, ready and the surrounding scrolled reader, in both themes at both widths. The panel follows the hand-off's Record view state sheet: coral label marker, bordered surface, compact action, blue indeterminate track and full-width copy row. The test holds only the ISCC intersection notification so the idle state can be captured, then uses the real Compute action and a held wasm request to capture computation. Ready uses the real wasm result. Separate three-engine functional tests use the unmodified observer and verify automatic loading, timing, navigation races, copying and recovery. Reduced-motion screenshots keep the indeterminate bar still without assigning it a numeric progress value.

## Reproducing comparisons

```sh
npm run build
npx playwright install chromium
npx playwright test --project=chromium-visual
```

Snapshots are specific to the operating system because system-font rasterization differs. Windows baselines support local development; Ubuntu 24.04 baselines are used by the pinned CI and catalogue-refresh runners. Both use the Chromium revision installed by the project's locked Playwright version. The Linux baselines were generated and compared in Ubuntu 24.04 under WSL, with Node 24.4.1 and Playwright's Chromium 153.0.8010.12.

After inspecting an intentional visual change against the hand-off, regenerate with `--update-snapshots` on both platforms, inspect the resulting images, then rerun the comparison without that flag. The tests wait for bundled fonts and disable animations and the text caret. They do not relax the default pixel-difference allowance or hide record content. All Common Crawl requests use local fixtures; unexpected external hosts fail the test.
