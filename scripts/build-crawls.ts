/** Generate the browser catalogue offline; refresh the snapshot explicitly. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseCrawls } from "../src/state/catalogue.ts";
import { type Crawl, parseCatalogue, parseWetStats } from "./catalogue.ts";

const archive = "https://data.commoncrawl.org/crawl-data/";
const snapshot = new URL("../data/crawls-source.json", import.meta.url);

/** Fetch build inputs with a bounded timeout and fail on HTTP errors. */
async function getHtml(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${response.status} fetching ${url}`);
  return response.text();
}

/** Preserve known per-crawl WET statistics when refreshing the release list. */
async function refresh(): Promise<void> {
  const crawls = parseCatalogue(await getHtml(`${archive}index.html`));
  let previous: Crawl[] = [];
  try {
    previous = JSON.parse(await readFile(snapshot, "utf8"));
  } catch {
    /* The first refresh has no snapshot. */
  }
  const byId = new Map(previous.map((crawl) => [crawl.id, crawl]));
  for (const crawl of crawls) {
    const old = byId.get(crawl.id);
    if (old?.files)
      Object.assign(crawl, { files: old.files, wetTiB: old.wetTiB });
  }
  const latest = crawls[0];
  if (!latest) throw new Error("No released crawls.");
  Object.assign(
    latest,
    parseWetStats(await getHtml(`${archive}${latest.id}/index.html`)),
  );
  await mkdir(new URL("../data/", import.meta.url), { recursive: true });
  await writeFile(snapshot, `${JSON.stringify(crawls, null, 2)}\n`);
}

if (process.argv.includes("--refresh")) await refresh();
const crawls = parseCrawls(JSON.parse(await readFile(snapshot, "utf8")));
await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../public/crawls.json", import.meta.url),
  `${JSON.stringify(crawls)}\n`,
);
await mkdir(new URL("../src/state/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../src/state/landing-crawls.json", import.meta.url),
  `${JSON.stringify(crawls.slice(0, 6), null, 2)}\n`,
);
const years = [...new Set(crawls.slice(6).map((crawl) => crawl.year))].map(
  (year) => ({
    year,
    count: crawls.slice(6).filter((crawl) => crawl.year === year).length,
  }),
);
await writeFile(
  new URL("../src/state/crawl-years.json", import.meta.url),
  `${JSON.stringify(years, null, 2)}\n`,
);
console.log(`Bundled ${crawls.length} crawls; latest ${crawls[0]?.id}.`);
