# Implementation evidence

The source requirements are in the local `cauldron/WET-Explorer-Implementation-Plan.md`, design brief, and design HTML. The goal remains the complete eight-milestone implementation, including release verification.

## Milestones

- [x] 0: Scaffold, imported design, crawl catalogue, fixture tooling, static sub-path smoke, CI workflow (local checks green; hosted CI awaits repository creation).
- [ ] 1: Test-first data layer, real offsets, exhaustive split invariance, retry recovery.
- [ ] 2: Reader worker, read-ahead, bounded cache, virtual stream, state harness.
- [ ] 3: Reader, raw text, long text, direction, keyboard controls.
- [ ] 4: Navigation, permanent links, direct fetch and compatibility path.
- [ ] 5: Persistence, filters, summaries, all brief states.
- [ ] 6: Lazy ISCC worker with reference-code verification.
- [ ] 7: Accessibility, measured budgets, three engines, visual checks, docs, deployment, monthly catalogue refresh.

## Design questions

- Titusz approved records read plus byte progress for the return-position link; no estimated total before EOF.
- Titusz approved OFL-1.1 for the two bundled fonts; code dependencies remain restricted to MIT, Apache-2.0 and BSD.

## Verification still required

Milestone 0 evidence: `npm run lint`, `npm test` (3 catalogue tests), `npm run build`, `npm run check:budgets`, and `npm run test:e2e` (Chromium, Firefox, WebKit) pass. Initial JS 7,213 bytes gzip; CSS 2,162 bytes gzip; fonts 102,168 bytes. All fixture acquisition is manual and recorded in `tests/fixtures/sources.json`; the modern sample has the six expected initial member offsets. The static landing is scaffold-only; navigation is implemented in milestone 4.

Live core path in Chrome, Firefox and Safari; a tagged GitHub Pages deployment to `titusz/wet-explorer`; requirement-by-requirement completion audit. Local tests alone do not establish these.
