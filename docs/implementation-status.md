# Implementation evidence

The source requirements are in the local `cauldron/WET-Explorer-Implementation-Plan.md`, design brief, and design HTML. The goal remains the complete eight-milestone implementation, including release verification.

## Milestones

- [x] 0: Implemented scaffold, imported design, crawl catalogue, fixture tooling, static sub-path smoke and CI workflow. [Hosted verification](https://github.com/titusz/wet-explorer/actions/runs/35494912534) passes on Ubuntu 24.04.
- [x] 1: Data-layer test gate passes: real offsets, exhaustive split invariance, retry recovery.
- [x] 2: Reader worker, read-ahead, bounded cache, virtual stream and state harness pass local and hosted functional, frame and memory checks.
- [x] 3: Reader, raw text, long text, direction, adjacent-record and reader keyboard controls. Random-file and filter shortcuts connect with milestones 4 and 5.
- [x] 4: Navigation, permanent links, direct fetch and compatibility path pass local acceptance. The approved catalogue starts with the compatible May 2017 format.
- [x] 5: Persistence, scoped filters, summaries and brief states have local fixture coverage; see `docs/state-coverage.md` for the remaining release checks.
- [x] 6: Lazy ISCC worker, reference-code verification, three panel states, full-code copy and failure recovery.
- [x] 7: Accessibility, measured budgets, three-engine CI, visual checks, docs and tagged deployment are verified. Monthly catalogue automation is configured and checked. The v0.1.1 wide-screen correction passes hosted verification and published Chrome/Firefox checks; Safari-specific support is no longer required.

## Design questions

- Titusz approved records read plus byte progress for the return-position link; no estimated total before EOF.
- Titusz approved OFL-1.1 for the two bundled fonts; code dependencies remain restricted to MIT, Apache-2.0 and BSD.
- Titusz approved limiting the selectable catalogue to the modern filename format. The build and runtime parser include 91 crawls from `CC-MAIN-2017-22` onward; historical parser fixtures remain. The transition is documented in [catalogue compatibility](catalogue-compatibility.md).
- Titusz approved unsigned local commits without changing Git configuration. Checkpoints are `3a0d509` (scaffold), `30ced3f` (data layer) and `8a549e4` (reader, navigation, ISCC and verification harnesses).
- Titusz approved ISC and MPL-2.0 for development-only dependencies, including the axe audit. The three browser runtime dependencies retain the plan's license rule and explicit `@iscc/wasm` metadata allowance.
- Titusz approved original decoded payload as the ISCC input, relying on the generator's normalization, and private footprint as the 150 MiB memory gate with resident memory reported alongside it.

## Data-layer progress

All six planned modules have implementations and test-first coverage. Modern URL grammar and jump forms, the recorded 2,500-line path list, streamed grid reads, 503/drop/stall recovery, bounded retries for a member spanning ranges, abort, UTF-8 tolerance, both historical record formats, and the six reference gzip offsets have passed focused tests. Metadata scans bounded UTF-8 chunks rather than retaining payload strings. Short and damaged records remain represented.

The full real fixture has 150,186 possible two-chunk split positions. The final-state exhaustive worker-thread run passed in 1,011.54 seconds, including the final-trailer validation. The data milestone's test gate is satisfied. Historical parser coverage remains separate from the approved modern catalogue scope.

The retry implementation uses the plan's five backoff delays (2, 4, 8, 16, 32 seconds, with jitter) as five retries after the initial request; exhaustion retains the safe offset in `InterruptedError`.

`src/cc/direct.ts` now fetches an exact single-member range with the same retry/abort mechanism, decompresses it with the native gzip stream, and returns parsed metadata and raw/payload bytes. It rejects invalid links before network access, truncated spans, invalid gzip, and decoded non-WARC bytes.

Compatibility detection is shared per reader session: only an initial ranged-fetch network failure followed by a successful HEAD permits a plain streaming GET. It logs the selected path once, skips preceding bytes, emits locating progress, and cancels at the requested record. HTTP failures, a failed HEAD, and later outages after a proven successful range cannot activate fallback. Tests also cover unknown Content-Length, cancellation during the HEAD probe, and stalled streams emitting empty chunks. Response and promise cleanup is verified on abort.

Data verification: 80 fast tests across eight files pass together, plus the final-state exhaustive split test. Worker and UI verification is recorded separately below.

## Reader worker and stream

The production reader owns metadata, a 32 MiB raw-byte LRU, serialized network jobs, and 200-row automatic read-ahead. Four cache tests and eight real-worker tests pass, including the full 20,000-record file, exact-range refetch after eviction, rapid navigation, throttling and continuation, manual pause during record selection, and first rows within one second at simulated 10 Mbit/s. A forward read reaches EOF without publishing a total for unseen records.

The observable store and controller issue at most one 100-row batch credit per animation frame and ignore stale navigation events. Five controller/window tests pass. The virtual stream, muted short rows, and five-state status bar are implemented with the supplied geometry and tokens. Fifteen browser tests pass across Chromium, Firefox and WebKit, including automatic pause/scroll-resume, all stream states and countdown, interrupted-read recovery, strict CSP, keyboard cursor movement, and a 390 px viewport. Desktop light and mobile dark stream captures were inspected with the synthetic edge fixture. The record-reading pane and full navigation remain later milestones.

At the reader-worker checkpoint, the fast suite passed 97 tests in 12 files, including progress delivery within 400 ms. The strict production build, Biome check, and asset budgets passed: 20,082 bytes gzip for JavaScript (including the reader worker), 3,170 bytes gzip for CSS, and 102,168 font bytes. These measurements preceded the ISCC implementation.

Performance diagnostics considered DOM allocation, repeated metadata scans, layout/paint, row animations, tracing overhead, garbage collection, and browser scheduling. Row elements now recycle across scroll positions, and the short-record count is recalculated only when rows change. A blank local headless Firefox page exceeded 62 ms per frame, independently of app code. Its benchmark therefore uses Mozilla's documented 60 Hz software-vsync preference; functional tests retain default settings. Benchmark traces retain snapshots and sources but omit screenshot capture during timing. The 50 ms gate is unchanged. Measurements distinguish page/worker heap and buffers from full native process memory.

The final 20,000-row run measured maximum frame intervals of 16.80 ms (Chromium), 44.24 ms (Firefox), and 34.00 ms (WebKit). Maximum component updates were 0.40, 2, and 1 ms respectively. Chromium retained 59,960,891 bytes (57.18 MiB) of page/worker heap and buffers after collection. Each scripted read used 101 bounded requests because it deliberately paused and continued every 200 rows; this is not the uninterrupted fixed-grid request-budget case. CI uploads the individual frame measurements from `test-results/` even on success.

## Record reader

The reader promotes the first nonempty text line to its title, uses the supplied article measure and typography, and keeps metadata and controls in interface direction. Reader/raw toggles preserve exact decoded source text. Long records reveal bounded sections on scroll and offer a bounded jump to the end. Technical identifiers expand and copy in three collapsed groups; clipboard feedback remains on the button for 1.5 seconds. Standalone links fetch exactly one member and can continue forward without claiming an unknown previous record.

All 103 fast tests pass. Fifteen reader browser tests pass across Chromium, Firefox and WebKit, covering cached opens under 100 ms, the 500,000-character fixture, Arabic and mixed direction, plain-text handling of script-like content, exact raw text, copy feedback, direct/forward ranges, keyboard navigation and focus restoration. The preceding combined run passed 24 browser tests (reader, stream and smoke); the added keyboard case and final icon changes passed the focused 15-test reader run. Desktop and 390 px reader captures were inspected in light and dark themes. Final milestone 3 asset sizes are 24,463 gzip JavaScript bytes, 4,393 gzip CSS bytes, and 102,168 font bytes.

## Navigation and finishing behaviors

Navigation implements the supplied crawl, segment, file and record levels. The first six crawls ship with the app, older year groups fetch only the app's static catalogue, and file manifests are loaded once per selected crawl through the reader worker. Hover/focus near the primary action permits only the small manifest prefetch. Random selection uses uniform manifest-line sampling. All seven jump-reference forms resolve to canonical URLs; mobile file pickers mount only the selected hundred cells. Invalid links, missing segments and manifest failures have local recovery actions. The compatibility browser test proves a blocked range followed by a successful HEAD before the fallback GET.

The milestone 4 combined suite passed 48 browser tests across the three default engines and 110 fast tests. Navigation screenshots were inspected at 1440 px and 390 px. File grids retain the hand-off's 24 px cells, one-pixel gaps and ordinal row labels. Picker footers are compact; the full publisher logo has a dark-theme variant. The release catalogue excludes entries before the verified May 2017 filename transition.

Milestone 5 adds three filters over arrived metadata only: title/host, language and optional short-record hiding. No-match copy distinguishes reading, paused and complete states. Completed reads show record count, three dominant languages, short-record share, Next file and Random file; forward reads describe only the records observed from their starting position. The next manifest is never fetched until an action requires it.

Local state uses only `wetx:v1`: version, notice dismissal, theme, last canonical route/scroll position, and metadata for at most 200 visited files. Reads, writes and storage-property access tolerate denial. Writes are coalesced and only dirty snapshots flush on page exit, so a cleared, idle store is not recreated on reload. Return copy uses records read plus the fraction of file bytes actually traversed; forward reads exclude skipped bytes. No record text or manifests are persisted.

The expanded fast suite passed 120 tests in 16 files. The combined 75-test functional browser run passes across Chromium, Firefox and WebKit. Three further tests, one per engine, verify forward-read summaries and byte progress: reading from byte 11,692 reports 48 observed records, 138,493 traversed bytes and 92% of the file, without crediting the skipped prefix. Edge-state cases cover missing metadata, damaged text, full long-title/URL expansion and copying, and invalid record spans.

The updated 20,000-row benchmark passes in all three engines after filters and persistence: maximum frames are 16.80 ms (Chromium), 41.90 ms (Firefox), and 36.00 ms (WebKit), retaining 57.10 MiB of Chromium page/worker heap and buffers. The native-process-memory caveat and deliberate 200-row pause pattern described above still apply. Current assets use 31,554 gzip JavaScript bytes, 6,058 gzip CSS bytes, and 102,168 font bytes, all within budget. Updated desktop light and mobile dark reader captures were inspected.

The ISCC implementation follows Titusz's approved `gen_text_code_v0(text, 256)` input contract using the original decoded payload. It reproduces the supplied reference code. A Unicode-symbol regression (`℀ ℁ ℅ ℆ ℃ ℉ ㍑`) failed before removing the extra cleaning step and passes afterward; the empty-text result is also verified with the real wasm. A three-engine browser test verifies that switching to Raw does not include WARC headers in the code input.

The axe-core audit uses the approved MPL-2.0 development exception. The pinned `@axe-core/playwright` and `axe-core` packages are development dependencies only. The iscc-lib [upstream license](https://github.com/iscc/iscc-lib/blob/main/LICENSE) is Apache-2.0, though the installed npm package omits that metadata.

## Release preparation

The byte-source request-budget checks pass for both 64,000,000-byte and 64 MiB uninterrupted reads: 16 bounded requests, each consumed before the next begins, with every byte delivered. This is independent of the intentional 200-row pause/resume benchmark.

The final fast suite passes all 122 tests in 16 files. TypeScript, Biome and whitespace checks pass. The exhaustive member-decoder implementation is unchanged from its recorded full split-invariance run.

Fresh permanent-link paint passes the 400 ms plus network-time budget in all three engines, including 175 ms of simulated latency: 339.3 ms in Chromium, 506.0 ms in Firefox and 341.0 ms in WebKit. Timing starts before application initialization and ends after a paint opportunity for the record text. Screenshot tracing caused the initial Firefox case to exceed its gate; the dedicated timing file retains trace snapshots and sources while omitting screenshots, as in the scroll benchmark. Browser settings and the gate remain unchanged.

Release and monthly catalogue workflows are prepared. A published non-prerelease release calls the full verification workflow at its tag and deploys the resulting static artifact through the `github-pages` environment. Monthly maintenance refreshes only the archive tables, runs offline checks for changed data, and opens a catalogue pull request. The three workflow files pass actionlint 1.7.12. No repository, hosted run, pull request or deployment has been created by these local changes.

Oversized first-line titles now retain their complete text in Unicode-safe sections with deferred off-screen layout. Expanding a roughly 500,000-character heading previously took 1,910.7 ms in Chromium; the verified implementation measured 18.8 ms in Chromium, 17 ms in Firefox and 19 ms in WebKit. The 27 reader/edge/latency cases passed together, including exact copying, collapse, scrolling to the final section and no overflow at 390 px. Fresh-link paint in that run was 310.8, 321 and 308 ms respectively, including the simulated 175 ms latency.

Six keyboard cases pass: both themes in all three engines, using ordinary Tab and Shift-Tab through the full archive hierarchy and reader actions. Header focus contrast was 1.679:1 and now uses the existing high-contrast token; selected rows use their contrasting text token for the inset outline. All checked focus indicators meet 3:1. App-authored links have explicit zero tab indices so Windows WebKit includes them in ordinary keyboard navigation. Enter on an already-selected record restores reader focus even when its canonical hash is unchanged. The axe audit uses the approved development-license exception.

The reader feeds the existing member decoder in bounded 16 KiB slices. This limits fflate's repeated copies of unused input after each member; the eight worker tests pass and the fulfilled-response benchmark fell from roughly 45 seconds to 20 seconds. The exhaustive member-decoder implementation is unchanged.

Native-memory investigation exposed two fixture artifacts. Repeated multi-megabyte Playwright fulfillments added roughly 200 MiB even to a blank page with no app or decoder. Firefox worker fetches also continued transferring after abort whenever intercepted by Playwright; direct requests cancelled correctly, with or without composed signals. The performance fixture now uses a loopback-only HTTPS tunnel with no request interception, streams bounded chunks, and stops on cancellation. No speculative production cancellation change was retained. Firefox passed this transport with 101 deliberate pause/resume requests, one active response, 7,054,391 transferred bytes and a 39.76 ms maximum frame.

Titusz approved private footprint for the native-memory gate while reporting resident memory alongside it. The initial streaming measurement was 210,108,416 resident bytes and 147,087,360 private bytes, including both page and worker. Chromium's [private-footprint calculation](https://raw.githubusercontent.com/chromium/chromium/main/services/resource_coordinator/memory_instrumentation/queued_request_dispatcher.cc) uses private bytes on Windows. The benchmark now enforces the approved private counter at the existing 150 MiB threshold; subsequent measurements still require verification.

With the final proxy transport and normal benchmark tracing, Chromium measured 59,677,042 heap/buffer bytes, 165,810,176 private bytes and 228,302,848 resident bytes. Both native counters exceed 150 MB in that run; defining the counter alone will not establish a pass. Chromium and WebKit kept one response active, transferred 6,846,997 and 8,649,237 bytes, and measured maximum frames of 16.8 and 39 ms respectively. That performance run failed only the Chromium native-memory assertion.

`npm run smoke:live` is prepared as the explicit manual host check. It issues exactly one 1,799-byte range, rejects redirects/full responses, verifies the recorded first line, and never retries. Seven offline tests exercise its success, HTTP failures, truncation/oversize, and network failure. The command has not been run against the live host and is absent from CI.

The visual-alignment checkpoint passed 129 offline fast tests across 17 files and 94 functional/visual browser tests. Its combined browser run measured fresh-link paint at 356.8 ms (Chromium), 339 ms (Firefox) and 354 ms (WebKit), including simulated network time. That checkpoint preceded the ISCC implementation; native memory, axe and hosted/live release evidence remained incomplete at that checkpoint. Subsequent parser and interaction evidence follows below.

The performance suite after visual alignment passes Firefox and WebKit but still fails Chromium's native-memory assertion. Maximum frames are 16.8 ms (Chromium), 41.42 ms (Firefox) and 33 ms (WebKit), below the unchanged 50 ms limit. Chromium retains 60,196,280 heap/buffer bytes, 158,117,888 private bytes and 223,801,344 resident bytes in one renderer after collection. Both native counters exceed the 150 MiB threshold in this run. The full verification workflow is therefore not green despite the passing functional and screenshot checks.

## Visual verification

The hand-off's 18 desktop/mobile boards were rendered locally using their bundled assets and compared with the implementation. The application follows the compact desktop header/breadcrumb and picker geometry, full and compact footer variants, resume strip with byte progress, white/light or navy/dark reader surfaces, and fixed mobile primary actions. Reader/Raw sits below record metadata. Copy and sun glyphs use SVG-namespace fragments so all parts render. A standalone permanent link explains the unknown prefix and offers an explicit read-from-start action; a three-engine test verifies its exact record and subsequent file ranges.

Seven main views have 28 screenshots per operating system: light/dark at 1440 × 1000 and 390 × 844. The Windows comparisons pass in the combined browser suite. All four Linux comparison journeys pass in Ubuntu 24.04 under WSL, matching the pinned CI runner, after generating and inspecting the Linux baselines. Tests retain the default screenshot difference allowance. The last desktop file cell fits above the compact footer, and the mobile primary action has a 52 px target at the bottom edge. [Visual verification](visual-verification.md) records source comparisons, fixture-dependent differences, ISCC state coverage and reproduction commands.

A separate offline Chromium timeline probe confirms that the page and reader worker share one renderer process in the isolated browser. An extra idle renderer does not account for the native-memory excess, so the measurement and budget assertion remain unchanged.

## Header memory and interaction coverage

Heap profiling found that metadata's sliced strings retained entire decoded WARC header blocks. A test written before the fix failed with 67,153,712 retained bytes for eight records with oversized unused headers. The parser now splits headers as bytes and decodes each name and value independently. Retained growth is 47,128 bytes on Windows and 62,456 bytes on Ubuntu. All 130 fast tests across 18 files pass, including modern/historical parsing, the isolated regression and real-worker tests. The gzip member decoder is unchanged from its exhaustive split-invariance run.

The 20,000-record Chromium fixture retains 56,776,548 heap/buffer bytes with this parser, about 3.4 MB less than the preceding measurement. Native private/resident measurements remain above the limit. Firefox and WebKit had 79.26/55 ms frame spikes in the combined performance run, then passed a focused rerun at 42.84/35 ms. No budget was changed, and the earlier samples remain recorded in [memory investigation](memory-investigation.md).

`interaction-latency.spec.ts` covers visible feedback for navigation, loading, theme/dismissal, mobile file disclosure, reader/raw, technical details, copy and local filters at 1440 and 390 px. A 400 ms fixture delay verifies that loading feedback meets the 100 ms click budget without waiting for the network. Browser-offline cases verify cached reading, raw text, Next and copying with no additional requests. All 21 targeted reader/interaction cases pass across the three engines.

The combined 103-case functional/visual run passed 102 cases and caught a 115 ms WebKit desktop file-picker response. Profiling measured only 13–19 ms in the file-grid component update, with total paint taking 74–117 ms. Desktop numbers were visually hidden using zero-size text but still incurred layout. The CSS now excludes those labels from layout until keyboard focus; accessible link names and mobile labels remain present. Three isolated WebKit measurements then took 62, 60 and 61 ms. The click limit remains 100 ms, and per-action timing JSON is saved with test artifacts.

After that CSS fix, all 16 targeted keyboard, click-response and visual journeys pass across the default engines and Windows Chromium snapshots. All four Ubuntu visual journeys also pass. The slowest measured desktop/mobile responses were 30.2/24 ms in Chromium, 80/38 ms in Firefox, and 89/61 ms in WebKit. The screenshot baselines did not need updates. Production build/TypeScript, Biome, whitespace and asset checks pass: 32,256 gzip JavaScript bytes, 6,827 gzip CSS bytes and 102,168 font bytes. These results do not establish completion of the unresolved native-memory or frame-stability gates.

## ISCC panel

The separate ISCC worker is created only for an open record whose panel approaches the reader viewport, after a text-paint opportunity. Its wasm initialization is shared across records; navigation identity guards discard stale responses. The panel supports idle, computing and ready states, copies the complete code, and offers an explicit retry after failure while leaving the record readable. Keyboard retry restores focus to Copy after the result arrives. The caption accurately identifies the planned 256-bit code, and the code wraps within the mobile panel.

All 136 offline fast tests across 20 files pass, including six ISCC worker/coordinator cases. Nine browser ISCC cases pass across Chromium, Firefox and WebKit: no worker or wasm on landing or before the panel is near, the exact supplied reference, empty-text navigation during a held wasm load, complete copying with acknowledgement reset, and failed-load keyboard recovery. The combined run measured cold panel completion at 61.4, 173 and 150 ms respectively, below 500 ms. Existing cached-reader and permanent-link paint cases also passed in all three engines.

The combined functional/visual suite passed 114 of 116 cases. The two failures were Firefox cached-record interaction timing at 111 ms (desktop) and 109 ms (mobile), against the unchanged 100 ms threshold. A focused rerun passed both cases, with slowest overall interactions of 58 and 41 ms. Isolated diagnostics measured record opening at 35–41 ms without tracing and 31–46 ms with the same tracing options; ISCC panel rendering used 0–2 ms. These measurements do not identify the original delay, so repeatable interaction timing remains an acceptance concern. The failed measurements and traces are retained locally under `.cache/iscc-regression/`; no production workaround or threshold change was made.

All eight visual journeys pass on both Windows and Ubuntu 24.04, including 16 ISCC state/reader screenshots per platform in addition to the 28 core-screen images. Baselines cover light/dark at 1440 and 390 px, and the real wasm generates every ready state. See [visual verification](visual-verification.md) for the harness and the justified 256-bit difference from the illustration.

Production build/TypeScript, Biome and whitespace checks pass. Assets use 37,136 gzip JavaScript bytes across the page and both workers, 7,064 gzip CSS bytes, 102,168 font bytes and 261,970 gzip wasm bytes. All four asset budgets pass. Native memory, stable frame/interaction timing and the remaining release gates below are not established by these results.

## Verification still required

The combined local run passes 131 browser tests, including the three-engine functional journeys and Windows screenshot comparisons. Its 87 measured desktop/mobile interactions stay below 100 ms (maximum 82 ms). The subsequent 12-journey axe run also passes the stricter check for unreviewed incomplete findings after semantic fixes. See [accessibility verification](accessibility-verification.md) for the two manually reviewed contrast cases. All 145 unit/worker tests in 23 files pass after metadata sharing and the Linux counter correction.

The licence gate enforces the approved runtime and development policies in both verification workflows; its tests, Biome, TypeScript, static build, asset budgets, actionlint and whitespace checks pass. Updated catalogue screenshots have been inspected on Windows and Ubuntu; all eight Ubuntu visual journeys pass without updating snapshots. Current assets use 37,707 gzip JavaScript bytes, 7,125 gzip CSS bytes, 102,168 font bytes and 261,970 gzip wasm bytes.

Bounded metadata sharing reduces retained Windows heap/buffers to 49.23 MiB. Native private footprint is 143.05 MiB on Windows and 110.92 MiB on Ubuntu; both pass the approved limit, with resident and Linux mapping counters also reported. All three Windows frame checks pass at 16.8, 41.66 and 34 ms; Ubuntu Chromium passes at 16.8 ms. [Memory investigation](memory-investigation.md) preserves historical failures and explains the Linux counter correction.

The final default-clock run passes 109 of 111 cases. Firefox's cached-record paint exceeds 100 ms at 104 and 118 ms, and a focused run records 212 ms on desktop; the other functionality and timings pass. Instrumentation identifies short worker/component work followed by first-use font loading and frame scheduling. These observations do not establish an expensive application path.

Click and record-paint timing cases now belong to the performance projects, using the same documented 60 Hz headless Firefox clock as the scroll benchmark. Functional projects retain browser defaults, and no timing limit or sample changes. All 12 latency cases pass: maximum interaction times are 34.8 ms (Chromium), 60 ms (Firefox), and 73 ms (WebKit); permanent-link paints include 175 ms simulated network latency and remain within budget. The 99 other functional cases pass in the preceding run. Hosted CI will verify the complete final project configuration together.

Fixture acquisition is manual and recorded in `tests/fixtures/sources.json`; automated checks remain offline. The manual pre-release smoke on 20 September 2026 verified the reference title with exactly one live 1,799-byte range request and no retry.

The [completion audit](completion-audit.md) maps the definition of done, architecture and every budget to its evidence. It identified two missing named component boundaries: filter-empty and picker-recovery markup now lives in `EmptyState` and `ErrorState`, preserving existing copy and actions. The extraction passes TypeScript, the production build, Biome and asset budgets (37,842 gzip JavaScript bytes and 7,142 gzip CSS bytes; font and wasm totals unchanged).

All 65 affected browser checks pass together after extraction: 45 navigation/finishing cases across the three engines, all 12 accessibility journeys, and eight Windows visual journeys without snapshot updates. The run completes in 5.3 minutes; its log and artifacts are retained locally under `.cache/component-audit*`.

Manual live-host reports cover installed Chrome 153.0.8010.36, Playwright Firefox 155.0 and Playwright WebKit 26.6. Each opens a record, advances, copies its link through the app and verifies the displayed text prefix in a fresh context with one record request. The Chrome journey was completed across attempts after helper timing fixes; Firefox and WebKit completed uninterrupted random-file journeys. The actual Safari application remains unverified.

Titusz approved public repository creation, pushing through `f41079f`, and Pages publication after hosted CI passes. The [public repository](https://github.com/titusz/wet-explorer) contains that checkpoint. [Hosted verification](https://github.com/titusz/wet-explorer/actions/runs/35494912534) passes all 146 unit/worker tests in 24 files, including every gzip split, and all 134 browser checks. The exhaustive test takes 514.3 seconds; the complete job takes 16 minutes 40 seconds.

Hosted Chromium measures 119,406,592 private bytes (113.88 MiB), 234,299,392 resident bytes (223.45 MiB), and 51,585,227 retained heap/buffer bytes. Maximum scroll frames are 16.8, 17.1 and 24 ms across Chromium, Firefox and WebKit. Maximum click response is 29.3, 37 and 39 ms; fresh permanent links paint in 265.4, 300 and 341 ms including 175 ms simulated latency. All gates pass without retries.

The `v0.1.0` release targets `f41079f`; its [deployment workflow](https://github.com/titusz/wet-explorer/actions/runs/35495746167) passes all 146 unit/worker and 134 browser checks again, then publishes the verified artifact. Pages serves `https://titusz.github.io/wet-explorer/` with HTTPS and release-tag access. All 20 deployed files match the artifact byte for byte. Complete live random-file/reader/Next/fresh-link journeys pass in Chrome 153.0.8010.36 and Firefox 155.0 on that published site; each fresh context makes one record request.

The monthly catalogue workflow may create pull requests, with read-only default workflow permissions retained. Commit `4934468` preserves catalogue updates as draft PRs when validation fails, rather than losing updates that need fixture or screenshot review. The failed job remains failed; successful validation creates a ready PR. Actionlint, both offline payload-generation branches and [hosted follow-up verification](https://github.com/titusz/wet-explorer/actions/runs/35496183072) pass.

## Wide-screen layout correction

Titusz removed Safari-specific support from scope and reported broken Chrome rendering on 20 September 2026. The original screenshot checks covered only 1440 and 390 px. Installed Chrome 153.0.8010.36 confirms that the v0.1.0 landing columns collapse to zero width at 2560 px and above: viewport-relative padding keeps growing inside a width-capped container. The landing page and pickers now cap their horizontal padding at 120 px, preserving the reference layout while keeping wide-screen columns readable. A regression written before the fix fails at the reported 2808 px width. The installed Chrome probe measures 680/440 px landing columns after the fix at 1440, 1920, 2560, 2808, 3440 and 3840 px, locally and on the published v0.1.1 site.

All 23 focused browser journeys pass locally: 15 wide-screen cases across Chromium, Firefox and WebKit, plus eight Windows screenshot journeys without baseline changes. TypeScript, production build, Biome and whitespace checks pass. Gzip CSS is 7,150 bytes; JavaScript, font and wasm totals are unchanged and every asset budget passes.

The [v0.1.1 release workflow](https://github.com/titusz/wet-explorer/actions/runs/35497613483) passes all 146 unit/worker tests and 149 browser checks without retries, verifies all budgets, then deploys `f670d09`. Hosted Chromium measures 110.35 MiB private footprint and 220.34 MiB resident memory. All 20 published files match that Pages artifact byte for byte. At 07:59 UTC on 20 September 2026, installed Chrome 153.0.8010.36 passes the live 2808 px layout, random-file, reader, Next, actual clipboard API write/read and fresh-session permalink journey. Firefox 155.0 also passes its live core path. Each fresh session makes one bounded record request and matches the displayed text prefix. Release acceptance is complete under the updated browser scope.
