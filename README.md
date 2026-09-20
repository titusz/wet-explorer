# WET Explorer

Read Common Crawl's extracted web text directly in the browser. The implementation follows the local design hand-off and implementation plan; progress and remaining release gates are tracked in [docs/implementation-status.md](docs/implementation-status.md).

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

`npm run crawls:refresh` reads Common Crawl's published archive tables and updates the checked-in catalogue. Ordinary builds use the local snapshot. The browser never contacts the catalogue's source during landing.

Code is Apache-2.0. Readex Pro and JetBrains Mono are SIL OFL-1.1; their notices ship in `public/licenses/`. Fonts, ISCC artwork and CSS tokens were extracted from the supplied design hand-off. Latin and extended Latin subsets total about 100 KB; record text uses the specified system/Noto font stack.
