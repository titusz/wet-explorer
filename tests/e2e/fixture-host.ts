/** Serve recorded Common Crawl responses and prevent live traffic in browser tests. */
import { readFile } from "node:fs/promises";
import type { BrowserContext } from "@playwright/test";

export const fileRoute =
  "#/f/CC-MAIN-2026-34/1786091384908.68/20260807101845-20260807131845-00000";
export interface FixtureHost {
  requests: { url: string; range: string | undefined; method: string }[];
  unexpected: string[];
  busy: number;
  damaged: boolean;
  latency: number;
  rangeBlocked: boolean;
}

/** Intercept worker requests as well as page requests; no data-host request escapes. */
export async function fixtureHost(
  context: BrowserContext,
  fixture: string | Uint8Array = "synthetic-20k.warc.wet.gz",
): Promise<FixtureHost> {
  const file =
    typeof fixture === "string"
      ? await readFile(new URL(`../fixtures/${fixture}`, import.meta.url))
      : Buffer.from(fixture);
  const paths = await readFile(
    new URL("../fixtures/paths-sample.gz", import.meta.url),
  );
  const host: FixtureHost = {
    requests: [],
    unexpected: [],
    busy: 0,
    damaged: false,
    latency: 0,
    rangeBlocked: false,
  };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:43871") return route.continue();
    if (url.origin !== "https://data.commoncrawl.org") {
      host.unexpected.push(url.href);
      return route.abort();
    }
    const range = request.headers().range;
    host.requests.push({ url: url.href, range, method: request.method() });
    if (host.latency)
      await new Promise((resolve) => setTimeout(resolve, host.latency));
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Range,Content-Length",
      "Content-Type": "binary/octet-stream",
    };
    if (host.busy-- > 0)
      return route.fulfill({
        status: 503,
        headers,
        body: "<Code>SlowDown</Code>",
      });
    if (url.pathname.endsWith("/wet.paths.gz"))
      return route.fulfill({ status: 200, headers, body: paths });
    if (host.rangeBlocked) {
      if (range) return route.abort("failed");
      if (request.method() === "HEAD")
        return route.fulfill({
          status: 200,
          headers: { ...headers, "Content-Length": String(file.length) },
        });
      return route.fulfill({
        status: 200,
        headers: { ...headers, "Content-Length": String(file.length) },
        body: file,
      });
    }
    const match = /^bytes=(\d+)-(\d+)$/.exec(range ?? "");
    if (!match) {
      host.unexpected.push(`Unbounded request: ${url.href}`);
      return route.abort();
    }
    const first = Number(match[1]);
    const last = Math.min(Number(match[2]), file.length - 1);
    if (first > last) return route.fulfill({ status: 416, headers });
    const body = host.damaged
      ? Buffer.alloc(last - first + 1)
      : file.subarray(first, last + 1);
    return route.fulfill({
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${first}-${last}/${file.length}`,
        "Content-Length": String(body.length),
      },
      body,
    });
  });
  return host;
}
