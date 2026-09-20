/** Generate invented WET fixtures; explicitly download small real samples once. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import { Gunzip } from "fflate";

const root = new URL("../tests/fixtures/", import.meta.url);
const host = "https://data.commoncrawl.org/";
const realPath =
  "crawl-data/CC-MAIN-2026-34/segments/1786091384908.68/wet/CC-MAIN-20260807101845-20260807131845-00000.warc.wet.gz";

/** Build invented records with explicit byte lengths and optional edge headers. */
function record(
  text: string | Uint8Array,
  index: number,
  headers: Record<string, string> = {},
): Buffer {
  const payload =
    typeof text === "string" ? Buffer.from(text) : Buffer.from(text);
  const fields = {
    "WARC-Type": "conversion",
    "WARC-Target-URI": `https://example.org/pages/${index}`,
    "WARC-Date": "2026-08-07T11:12:14Z",
    "WARC-Record-ID": `urn:uuid:00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    "WARC-Identified-Content-Language": "eng",
    "Content-Type": "text/plain",
    "Content-Length": String(payload.length),
    ...headers,
  };
  const head = [
    "WARC/1.0",
    ...Object.entries(fields)
      .filter(([, value]) => value !== "")
      .map(([key, value]) => `${key}: ${value}`),
  ].join("\r\n");
  return Buffer.concat([
    Buffer.from(`${head}\r\n\r\n`),
    payload,
    Buffer.from("\r\n\r\n"),
  ]);
}

/** Compress each record separately, as in a WET file. */
async function writeMembers(
  name: string,
  records: Iterable<Uint8Array>,
): Promise<void> {
  const compressed: Buffer[] = [];
  for (const bytes of records) compressed.push(gzipSync(bytes));
  await writeFile(new URL(name, root), Buffer.concat(compressed));
}

/** Generate enough unique payload bytes to exercise the worker's LRU cap. */
function* manyRecords(): Generator<Buffer> {
  yield record("Synthetic file information", 0, { "WARC-Type": "warcinfo" });
  for (let index = 1; index <= 20000; index++) {
    const paragraph = `This is invented archive record ${index}. A patient researcher reads the open web, one small page at a time. `;
    yield record(`Archive note ${index}\n${paragraph.repeat(40)}`, index);
  }
}

/** Produce deterministic edge fixtures without requesting the live host. */
async function synthetic(): Promise<void> {
  await writeMembers("synthetic-edge.warc.wet.gz", [
    record("Invented fixture information", 0, { "WARC-Type": "warcinfo" }),
    record("\n\nA title after empty lines\nInvented content.", 1, {
      "WARC-Identified-Content-Language": "",
    }),
    record(
      "A long invented text\n" +
        "A calm sentence about reading. ".repeat(20000).slice(0, 499979),
      2,
    ),
    record("صفحة تجريبية\nهذا نص عربي مكتوب للاختبار فقط.", 3, {
      "WARC-Identified-Content-Language": "ara",
    }),
    record(
      "A mixed page صفحة\nEnglish words and العربية together. 日本語 Русский.",
      4,
      { "WARC-Identified-Content-Language": "eng,ara,jpn" },
    ),
    record(Uint8Array.of(0x62, 0x61, 0x64, 0xff, 0xfe, 0x0a), 5),
    record("Length disagrees", 6, { "Content-Length": "999" }),
    record("Unknown record kind", 7, { "WARC-Type": "extension" }),
    record("One moment, please...", 8),
    record("\n\n", 9),
    record(
      '<script>alert("text only")</script>\n<img src=x onerror=alert(1)>',
      10,
      { "WARC-Target-URI": "javascript:alert(1)" },
    ),
    record("Header fields are optional", 11, {
      "WARC-Date": "",
      "WARC-Identified-Content-Language": "",
      "WARC-Record-ID": "",
      "WARC-Target-URI": "",
    }),
    record("Keep only the declared prefix", 12, { "Content-Length": "4" }),
  ]);
  await writeMembers("synthetic-20k.warc.wet.gz", manyRecords());
}

/** Make one explicit, time-bounded maintenance download. */
async function download(path: string, range?: string): Promise<Uint8Array> {
  const response = await fetch(host + path, {
    headers: range ? { Range: range } : {},
    signal: AbortSignal.timeout(30000),
  });
  if (response.status !== (range ? 206 : 200))
    throw new Error(
      `${response.status} downloading ${path}; no automatic live retry.`,
    );
  return new Uint8Array(await response.arrayBuffer());
}

/** Preserve only the first complete members, byte for byte. */
async function realHead(
  path: string,
  count: number,
  name: string,
): Promise<object> {
  const compressed = await download(path, "bytes=0-1048575");
  const offsets = [0];
  const decoder = new Gunzip(() => {});
  decoder.onmember = (offset) => offsets.push(offset);
  decoder.push(compressed, false);
  const end = offsets[count];
  if (end === undefined)
    throw new Error(
      `The bounded sample did not contain ${count} complete members.`,
    );
  const bytes = compressed.slice(0, end);
  await writeFile(new URL(name, root), bytes);
  return {
    name,
    source: host + path,
    members: count,
    bytes: end,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    offsets: offsets.slice(0, count),
  };
}

/** Acquire only the small samples named by the implementation plan. */
async function real(): Promise<void> {
  const manifest = [await realHead(realPath, 50, "real-head.warc.wet.gz")];
  const paths = gunzipSync(
    await download("crawl-data/CC-MAIN-2026-34/wet.paths.gz"),
  )
    .toString()
    .trim()
    .split("\n");
  await writeFile(
    new URL("paths-sample.gz", root),
    gzipSync(`${paths.slice(0, 2500).join("\n")}\n`),
  );
  for (const crawl of ["CC-MAIN-2013-20", "CC-MAIN-2017-04"]) {
    const lines = gunzipSync(await download(`crawl-data/${crawl}/wet.paths.gz`))
      .toString()
      .trim()
      .split("\n");
    const path = lines[0];
    if (!path?.startsWith(`crawl-data/${crawl}/`))
      throw new Error("Unexpected path list.");
    manifest.push(
      await realHead(
        path,
        20,
        `old-crawl-${crawl.slice(8, 12)}-head.warc.wet.gz`,
      ),
    );
  }
  await writeFile(
    new URL("sources.json", root),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

await mkdir(root, { recursive: true });
if (process.argv.includes("--download")) await real();
else await synthetic();
console.log("Fixture generation complete.");
// Read the committed source record only when asked, never during tests/builds.
if (process.argv.includes("--sources"))
  console.log(await readFile(new URL("sources.json", root), "utf8"));
