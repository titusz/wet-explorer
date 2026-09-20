# Completion audit

Audited against the supplied implementation plan and design brief on 20 September 2026, including Titusz's removal of Safari-specific support from the requirements. Release verification is complete. The v0.1.1 release corrects the wide-screen layout defect reported in v0.1.0, passes hosted verification, and is deployed and checked in installed Chrome.

## Approved decisions

- Return-position copy reports records read and byte progress, with no estimated record total before EOF.
- Readex Pro and JetBrains Mono may use OFL-1.1; their notices ship with the app.
- The selectable catalogue begins at the verified modern filename transition, May 2017. Historical parser fixtures remain.
- Local commits may be unsigned without changing Git configuration.
- Development-only dependencies may also use ISC and MPL-2.0. Browser dependencies retain MIT/Apache/BSD licensing and the explicit wasm metadata allowance.
- ISCC receives the original decoded payload and uses the library's normalization.
- Native memory is gated on private footprint below 150 MiB; resident memory is reported alongside it.
- Safari-specific support and an actual Safari application check are not required. Existing offline WebKit coverage remains useful and is retained.

## Definition of done

| Requirement | Evidence and remaining work |
| --- | --- |
| Live core path in Chrome and Firefox | Uninterrupted random-file journeys pass on published v0.1.1 in Chrome 153.0.8010.36 and Firefox 155.0, including Next and a fresh permanent link with one record request. Chrome's 2808 px check also verifies readable, centered columns and clipboard API copying without interception. Safari-specific support was removed from scope by Titusz. |
| Every brief state is reachable | [State coverage](state-coverage.md) maps every state to fixture journeys, including unavailable manifests, throttling, interrupted streams, empty filters, damaged text, missing metadata and mobile layouts. |
| Only own static files and Common Crawl requested | Fixture hosts reject unexpected origins; the unit setup rejects live fetch; CSP restricts connections and assets. Manual live reports contain only those two origins. Fonts and wasm are bundled. |
| Tests pass in CI | [v0.1.1 hosted verification](https://github.com/titusz/wet-explorer/actions/runs/35497613483) passes 146 unit/worker tests, including all 150,186 split positions, and all 149 browser tests without retries. |
| Budgets pass in CI | All asset, interaction, frame, memory, request and accessibility gates pass in the same hosted run; measured results follow below. |
| Static output works under a sub-path | [v0.1.1 is deployed](https://github.com/titusz/wet-explorer/actions/runs/35497613483) at [the HTTPS project URL](https://titusz.github.io/wet-explorer/). All 20 published files match the verified Pages artifact byte for byte, including both workers, wasm, fonts, catalogue, SVG assets and license notices. |

The manual single-record smoke passed with one 1,799-byte HTTP range and no retry. The live core-path helpers check record selection, Next, copying, and a fresh browser context making one record request. They compare the first 2,048 displayed characters by hash, not the entire payload. The v0.1.1 Chrome check uses the actual browser clipboard API for write/read in its isolated test context; earlier Chrome checks and the Firefox helper intercept the app's clipboard write. Firefox uses the plan's documented TLS-proxy exception. WebKit evidence does not establish a Safari application pass.

## Mechanism and architecture checks

| Area | Implementation and verification |
| --- | --- |
| Strict links and bounded reads | `src/cc/urls.ts` validates modern identifiers and safe byte spans. URL/jump table tests, `bytesource` tests and direct-record browser journeys cover rejection before fetching, range bounds and canonical round trips. |
| Streaming, recovery and compatibility | Reader worker owns fetch, inflate and parse. Byte-source tests cover fixed ranges, serialization, backoff, drops, stalls, abort and safe resumption. Compatibility requires a failed initial range and a successful HEAD before a streaming GET. |
| Correct gzip boundaries and tolerant WARC parsing | Recorded offsets, every two-chunk split, synthetic Unicode/damaged/long records and 2013/2017 fixtures exercise the data layer. The exhaustive run previously passed all 150,186 split positions in 1,011.54 seconds; the decoder has not changed since that run. |
| Bounded retained payloads and responsive stream | Worker owns a 32 MiB raw-byte LRU, bounded metadata sharing and automatic read-ahead. Worker/cache tests cover eviction and exact refetch. Store/controller tests cover stale events and frame-batched rows; browser tests exercise the virtual list and pause/resume. |
| Named design components | Every inventory name has a Lit element. `EmptyState` and `ErrorState` own the filter-empty and picker-recovery markup; the other named elements are in `src/ui`, with YearGroup in `crawl-list.ts` and both grids in `pickers.ts`. Existing fixture journeys verify their visible behavior. |
| Text rendering and navigation | Reader/edge tests cover text-only payload insertion, direction, progressive reveal, full-value copy, keyboard controls, history and standalone records. Source links accept only HTTP(S) and use the required rel values. |
| Honest progress and optional persistence | Only arrived metadata is filtered. Totals appear after EOF. Forward reads exclude skipped bytes from saved progress. `wetx:v1` holds preferences and at most 200 visited-file entries; denied/cleared storage is covered and no payloads/manifests are persisted. |
| ISCC isolation and input | Separate lazy worker loads only near an open panel. Real wasm tests verify the supplied reference, original-payload Unicode normalization, raw-view independence, navigation during loading and explicit failure recovery. |
| Styling, licensing and security | Tokens, local font subsets and reviewed Windows/Linux snapshots preserve the hand-off. CSP and text-only rendering are tested. Runtime/font notices ship under `public/licenses`; the locked dependency gate enforces the approved exceptions. |
| Maintenance and release | Verify, release deployment and monthly catalogue workflows pass actionlint. Hosted verification and tagged deployment pass; Pages has HTTPS and release-tag access, and repository permissions allow catalogue PR creation. Failed catalogue validation retains a draft PR and a failed job; successful validation opens a ready PR. Both payload branches pass an offline check. Real fixtures and development helpers are outside the deployed artifact. |

## Budget evidence

| Budget | Local evidence | Committed check |
| --- | --- | --- |
| JavaScript <= 60 KiB gzip | 37,842 bytes, including both workers | `scripts/check-budgets.ts` |
| CSS <= 20 KiB gzip | 7,150 bytes | Asset check |
| Fonts <= 120 KiB | 102,168 bytes | Asset check |
| Wasm <= 257 KiB gzip, lazy | 261,970 bytes; no early wasm request | Asset check and `iscc.spec.ts` |
| Click and cached record paint < 100 ms | Maximum interaction: Chromium 34.8 ms, Firefox 60 ms, WebKit 73 ms | `interaction-latency.spec.ts` |
| Fresh record <= 400 ms + request time | 312.6 / 308 / 387 ms with 175 ms simulated network latency | `reader-latency.spec.ts` |
| First rows < 1 s at 10 Mbit/s; status <= 400 ms | Real-worker fixture tests pass | Reader worker tests |
| 20,000-row scroll frames < 50 ms | Windows: 16.8 / 41.66 / 34 ms; Ubuntu Chromium: 16.8 ms | `stream-performance.spec.ts` |
| Private footprint < 150 MiB after scroll/GC | Windows: 143.05 MiB private, 204.37 MiB resident; Ubuntu: 110.92 MiB private, 217.59 MiB resident | Native renderer sample in stream benchmark |
| One active request; <= 17 per whole 64 MB file | Both decimal 64 MB and binary 64 MiB read in 16 sequential requests | Byte-source request-budget tests |
| WCAG AA, clean axe, keyboard path | Both themes and widths in three engines; documented manual review of two incomplete contrast findings | `axe.spec.ts`, `accessibility.spec.ts` |

Timing projects use the documented 60 Hz headless Firefox software clock; functional projects retain defaults. Native samples include every renderer of one isolated tab, including its workers. They represent retained memory after scrolling and forced garbage collection, not peak allocation. [Memory investigation](memory-investigation.md) records the higher intermediate readings and the platform counter definitions. The stream benchmark's intentional 200-row pause pattern makes 101 requests; the separate uninterrupted-read test establishes the whole-file request budget.

After the component extraction, all 65 affected browser checks pass in one run: 45 navigation/finishing journeys, 12 accessibility journeys and eight Windows screenshot comparisons, without baseline updates. TypeScript, production build, Biome, whitespace and asset checks pass. The run takes 5.3 minutes and its local log/artifacts are under `.cache/component-audit*`.

The complete project configuration passes together in [hosted CI](https://github.com/titusz/wet-explorer/actions/runs/35494912534): 146 unit/worker tests in 24 files, including the exhaustive decoder test in 514.3 seconds, followed by all 134 browser checks without retries. Logs and the `browser-test-results` artifact provide the measurements; copies are also retained locally under `.cache/hosted-verify-f41079f*`.

Hosted Chromium measures 119,406,592 private bytes (113.88 MiB), 234,299,392 resident bytes (223.45 MiB), and 51,585,227 retained heap/buffer bytes. Maximum frames are 16.8 / 17.1 / 24 ms, maximum click responses 29.3 / 37 / 39 ms, and fresh-link paints 265.4 / 300 / 341 ms with 175 ms simulated latency, in Chromium/Firefox/WebKit order. Asset totals match the table above. GitHub emitted an action-runtime deprecation annotation for `actions/upload-artifact@v4`, which ran successfully on Node.js 24; updating that action is a maintenance follow-up.

## Release gates

1. Publication is approved and the [public repository](https://github.com/titusz/wet-explorer) contains the reviewed history through `f41079f`.
2. Full hosted verification passes as recorded above, including the [catalogue-workflow follow-up](https://github.com/titusz/wet-explorer/actions/runs/35496183072) at `4934468`.
3. Pages is configured for GitHub Actions, HTTPS, version tags and catalogue PR creation. The [v0.1.0 release workflow](https://github.com/titusz/wet-explorer/actions/runs/35495746167) passes another complete 146-unit/134-browser verification and deploys `f41079f`. The deployed sub-path and all 20 artifact files are verified. Release Chromium measures 116.43 MiB private footprint and 226.47 MiB resident memory.
4. The [v0.1.1 release workflow](https://github.com/titusz/wet-explorer/actions/runs/35497613483) verifies and deploys `f670d09`: 146 unit/worker tests and 149 browser checks pass without retries. All 20 published files match the artifact. Installed Chrome 153.0.8010.36 preserves 680/440 px landing columns at 1440, 1920, 2560, 2808, 3440 and 3840 px. Its 2808 px live random-file/Next/clipboard/fresh-link journey passes at 07:59 UTC on 20 September 2026; Firefox 155.0 also passes the live core path. Release Chromium measures 110.35 MiB private footprint and 220.34 MiB resident memory. Safari-specific verification is no longer a release gate; the drafted hosted-Safari helper remains local and is not part of CI.
5. The plan's advice to tell Common Crawl before launch remains a product-owner action; no message has been sent.
