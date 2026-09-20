# Completion audit

Audited against the supplied implementation plan and design brief on 20 September 2026. Local implementation is verified; the complete release goal remains open until hosted verification, a tagged Pages deployment, and the Safari application check have evidence.

## Approved decisions

- Return-position copy reports records read and byte progress, with no estimated record total before EOF.
- Readex Pro and JetBrains Mono may use OFL-1.1; their notices ship with the app.
- The selectable catalogue begins at the verified modern filename transition, May 2017. Historical parser fixtures remain.
- Local commits may be unsigned without changing Git configuration.
- Development-only dependencies may also use ISC and MPL-2.0. Browser dependencies retain MIT/Apache/BSD licensing and the explicit wasm metadata allowance.
- ISCC receives the original decoded payload and uses the library's normalization.
- Native memory is gated on private footprint below 150 MiB; resident memory is reported alongside it.

## Definition of done

| Requirement | Evidence and remaining work |
| --- | --- |
| Live core path in Chrome, Firefox and Safari | Chrome 153.0.8010.36, Playwright Firefox 155.0 and Playwright WebKit 26.6 have local live-host reports. Actual Safari remains unverified. The Chrome journey was completed across attempts after correcting the manual helper's timing; Firefox and WebKit completed uninterrupted random-file journeys. |
| Every brief state is reachable | [State coverage](state-coverage.md) maps every state to fixture journeys, including unavailable manifests, throttling, interrupted streams, empty filters, damaged text, missing metadata and mobile layouts. |
| Only own static files and Common Crawl requested | Fixture hosts reject unexpected origins; the unit setup rejects live fetch; CSP restricts connections and assets. Manual live reports contain only those two origins. Fonts and wasm are bundled. |
| Tests pass in CI | Local evidence is recorded below. `.github/workflows/ci.yml` runs the exhaustive unit suite and all browser projects. No hosted run exists yet. |
| Budgets pass in CI | Every budget has a committed check and local evidence below. Hosted measurement remains pending. |
| Static output works under a sub-path | Vite uses relative asset URLs. Three-engine smoke and browser journeys serve `dist/` at `/wet-explorer/`. A public Pages deployment remains pending. |

The manual single-record smoke passed with one 1,799-byte HTTP range and no retry. The live core-path helper checked record selection, Next, the app's clipboard write, and a fresh browser context making one record request. It compared the first 2,048 displayed characters by hash; it did not compare the entire payload or the operating-system clipboard. Firefox used the plan's documented TLS-proxy exception. WebKit evidence does not establish a Safari application pass.

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
| Maintenance and release | Verify, release deployment and monthly catalogue workflows are prepared and pass actionlint. Repository settings and actual hosted execution remain pending. Real fixtures and development helpers are outside `dist/`. |

## Budget evidence

| Budget | Local evidence | Committed check |
| --- | --- | --- |
| JavaScript <= 60 KiB gzip | 37,842 bytes, including both workers | `scripts/check-budgets.ts` |
| CSS <= 20 KiB gzip | 7,142 bytes | Asset check |
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

The 145 fast unit/worker tests passed before the component extraction, which changes no data or worker logic. The exhaustive decoder check has prior local evidence, but its complete terminal log is not retained with this audit; hosted CI must produce durable evidence. All 12 latency cases and Windows/Linux stream measurements passed in their dedicated runs. The complete final project configuration has not run together in hosted CI.

## Release gates

1. Obtain approval to publish the reviewed source, documentation, assets and fixtures to the public `titusz/wet-explorer` repository. Automatic approval review rejected the earlier creation/push because explicit destination and payload approval was missing. No repository, remote, push or deployment was created.
2. Run the full hosted verification workflow, including exhaustive splits, all browser projects, accessibility and budgets. Resolve any hosted failure before release.
3. Configure Pages for GitHub Actions, release-tag access to its environment, and catalogue PR creation. Publish a reviewed release tag and verify the deployed sub-path and assets.
4. Verify the live core path in the actual Safari application, including a fresh permanent link. Record browser version, date and result.
5. Update the release evidence with hosted run/deployment URLs and the Safari result. The plan's advice to tell Common Crawl before launch remains a product-owner action; no message has been sent.
