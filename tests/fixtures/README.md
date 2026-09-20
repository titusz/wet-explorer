# Test fixtures

`npm run fixtures` deterministically builds invented edge records and a 20,000-conversion-record file (plus warcinfo). These are preferred for rendering, retry, memory and throughput tests.

`node scripts/make-fixture.ts --download` is a one-time, manual maintenance operation: it fetches at most 1 MiB of each real WET file using a bounded Range request, keeps only 50 modern or 20 historical members, and records the exact sources, offsets and SHA-256 hashes in `sources.json`. It also recompresses 2,500 real path lines. It stops on host errors rather than retrying automatically. Never run acquisition from tests or CI.

Real samples contain third-party web text with original rights retained by their authors. They are small compatibility fixtures, not Apache-licensed application content. See [Common Crawl terms](https://commoncrawl.org/terms-of-use). The entire directory stays outside `public/` and is not part of the published site.
