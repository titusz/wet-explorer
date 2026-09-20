/** Verify one known live WET member only when explicitly invoked by a maintainer. */
import { gunzipSync } from "node:zlib";
import { parseWarc } from "../src/cc/warc.ts";

export const reference = {
  url: "https://data.commoncrawl.org/crawl-data/CC-MAIN-2026-34/segments/1786091384908.68/wet/CC-MAIN-20260807101845-20260807131845-00000.warc.wet.gz",
  range: "bytes=11692-13490",
  length: 1799,
  title: "Acer Aspire 5 Spin – Auswahl – 0800Hardware",
} as const;

/** Make exactly one bounded request, rejecting redirects, full responses, and wrong content. */
export async function liveSmoke(
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetcher(reference.url, {
      headers: { Range: reference.range },
      redirect: "error",
      signal: controller.signal,
    });
    if (
      response.status !== 206 ||
      !/^bytes 11692-13490\/\d+$/.test(
        response.headers.get("Content-Range") ?? "",
      )
    ) {
      await response.body?.cancel();
      throw new Error(
        `Expected the exact 206 range; received HTTP ${response.status}. No retry.`,
      );
    }
    if (!response.body) throw new Error("Missing record response body.");
    const compressed = new Uint8Array(reference.length);
    const reader = response.body.getReader();
    let length = 0;
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        if (length + result.value.length > compressed.length)
          throw new Error("The response exceeded the requested member length.");
        compressed.set(result.value, length);
        length += result.value.length;
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    if (length !== reference.length)
      throw new Error("The member was truncated.");
    const record = parseWarc(gunzipSync(compressed));
    const title = new TextDecoder().decode(record.payload).split(/\r?\n/, 1)[0];
    if (record.damaged || title !== reference.title)
      throw new Error("The live record does not match the recorded reference.");
    return title;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

if (import.meta.main) {
  try {
    console.log(
      `Verified one ${reference.length}-byte ranged response: ${await liveSmoke()}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
