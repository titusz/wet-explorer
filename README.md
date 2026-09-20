# WET Explorer

Read Common Crawl's extracted web text directly in the browser. The implementation follows the local design hand-off and implementation plan; progress and remaining release gates are tracked in [docs/implementation-status.md](docs/implementation-status.md).

Choose a crawl and open a random file, or drill down through the segment and file pickers. Records arrive as the file is read. Reading pauses after about 200 unseen rows and continues when you approach the end of the list or choose Continue. Counts describe records already read; the file's total is unknown until EOF.

Open a row to read its text, inspect the exact raw record, or copy its permanent link. A permanent link requests only that record's gzip member. Previous is available only when earlier records are known; standalone records can continue forward or open the file from the top.

The ISCC panel computes a 256-bit Text-Code locally from the full record payload. Its separate worker and bundled wasm load only after the record text is displayed and the panel approaches the viewport. Copying uses the complete code; a failed computation leaves the text readable and offers an explicit retry.

The jump field accepts a global file position within the selected crawl, a complete WET filename, a Common Crawl HTTPS URL, an `s3://commoncrawl/` URI, a `crawl-data/` path, or this app's file/record link. The title/host, language and short-record filters apply only to metadata already read. They do not search the archive.

Keyboard controls: J/K or arrows move through records; Enter opens the active list row; Escape returns to the list; T toggles raw text; C copies the permanent link; Space pauses/continues; R opens a random file; `/` focuses the list filter. Ordinary typing and browser shortcuts retain their meaning.

Only the app's own static files and `data.commoncrawl.org` are requested. Optional browser storage under `wetx:v1` holds the dismissed notice, theme, last position, and progress metadata for at most 200 visited files. It contains no record text or file manifests. Denied or cleared storage does not prevent reading.

Requires Node.js 24 or later.

```sh
npm ci
npm run dev
```

The development server uses `http://127.0.0.1:43871`. `npm run build` writes static files to `dist/` with relative asset URLs. No backend is needed. For a production sub-path demonstration, run `node scripts/serve-dist.ts` and open `http://127.0.0.1:43871/wet-explorer/`.

```sh
npm run lint
npm test
npm run build
npm run check:budgets
npx playwright install chromium firefox webkit
npm run test:e2e
```

Tests are offline. Browser tests block external requests; unit tests reject live `fetch`. Fixture acquisition and catalogue refresh are explicit maintenance commands, never test setup.

`npm test` includes all 150,186 two-chunk split positions in the real 50-member fixture; this exhaustive check took about 17 minutes locally. `npm run test:fast` runs the remaining unit and worker tests during development. CI runs the complete suite.

`npx playwright test --project=chromium-visual` checks the main screens at 1440 and 390 px in both themes. Reviewed baselines are included for Windows and Ubuntu 24.04; CI is pinned to Ubuntu 24.04. See [visual verification](docs/visual-verification.md) for comparison coverage, explained differences from the hand-off, and baseline updates.

Browser performance projects run separately from the default-engine functional projects, with one browser at a time. Their traces omit screenshot capture during timing, and Firefox uses a 60 Hz software clock through the [documented `layout.frame_rate` preference](https://github.com/mozilla-firefox/firefox/blob/main/gfx/thebes/gfxPlatform.cpp). A loopback HTTPS fixture streams chunks and stops on cancellation; its disposable certificate is accepted only by those isolated test contexts. Measurements retain frame durations, transfer bytes, concurrency, Chromium page/worker heap and buffers, and renderer resident/private memory in `test-results/`. The native-memory budget remains unresolved; see the implementation evidence for the measured values and pending counter decision.

Interaction timing checks cover desktop and mobile control feedback, including a delayed network response; cached reading is also tested with the browser offline. An isolated metadata-retention test ensures that unused oversized headers can be released. [Memory investigation](docs/memory-investigation.md) distinguishes the verified retention fix from the unresolved process-memory gate and observed frame variability.

Before release, explicitly run `npm run smoke:live` for the manual host check. It makes exactly one 1,799-byte ranged request, rejects redirects and full-file responses, and checks the decoded first line against the recorded reference. It never retries and is absent from automated workflows. Its automated tests use recorded local bytes. This command does not replace the manual core-path check in Chrome, Firefox and Safari.

`npm run crawls:refresh` reads Common Crawl's published archive tables and updates the checked-in catalogue. Ordinary builds use the local snapshot. The browser never contacts the catalogue's source during landing.

The monthly catalogue workflow runs on the third day of each month at 05:23 UTC, or on manual dispatch. It fetches the archive tables, checks changed catalogues with offline tests, and opens a pull request for review. Repository Actions settings must allow creation of pull requests. The refresh job runs its own validation: `GITHUB_TOKEN` pushes do not start push workflows, and its PR workflows [require approval to run](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

For release, set the repository's Pages publishing source to **GitHub Actions** and allow release tags in the `github-pages` environment. Publishing a non-prerelease GitHub release reruns the complete verification workflow at that tag, then deploys its `dist/` artifact. This follows GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). Repository creation, hosted verification, manual live checks and the first deployment remain release gates; local workflow files do not establish a published site.

Code is Apache-2.0. Readex Pro and JetBrains Mono are SIL OFL-1.1; their notices ship in `public/licenses/`. Fonts, ISCC artwork and CSS tokens were extracted from the supplied design hand-off. Latin and extended Latin subsets total about 100 KB; record text uses the specified system/Noto font stack.
