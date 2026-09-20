/** Validate routes and file references before constructing Common Crawl URLs. */
export const DATA_ORIGIN = "https://data.commoncrawl.org";
const CRAWL = "CC-MAIN-\\d{4}-\\d{2}";
const SEGMENT = "\\d+\\.\\d+";
const FILE = "\\d{14}-\\d{14}-\\d{5}";
const crawlPattern = new RegExp(`^${CRAWL}$`);
const segmentPattern = new RegExp(`^${SEGMENT}$`);
const filePattern = new RegExp(`^${FILE}$`);
const pathPattern = new RegExp(
  `^crawl-data/(${CRAWL})/segments/(${SEGMENT})/wet/CC-MAIN-(${FILE})\\.warc\\.wet\\.gz$`,
);

export interface FileRef {
  crawl: string;
  segment: string;
  file: string;
}
export type Route =
  | { kind: "home" }
  | { kind: "crawl"; crawl: string }
  | { kind: "segment"; crawl: string; segment: string }
  | { kind: "file"; file: FileRef; from?: number }
  | { kind: "record"; file: FileRef; offset: number; length: number }
  | { kind: "invalid" };
export type Jump =
  | { kind: "position"; position: number }
  | { kind: "filename"; filename: string }
  | Extract<Route, { kind: "file" | "record" }>;

/** Accept only decimal, exactly representable, nonnegative byte positions. */
function integer(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

/** Validate every component, including references supplied outside the router. */
function validFile(file: FileRef): boolean {
  return (
    crawlPattern.test(file.crawl) &&
    segmentPattern.test(file.segment) &&
    filePattern.test(file.file)
  );
}

/** Construct the canonical archive path after rejecting untrusted components. */
export function filePath(file: FileRef): string {
  if (!validFile(file)) throw new Error("Invalid WET file reference.");
  return `crawl-data/${file.crawl}/segments/${file.segment}/wet/CC-MAIN-${file.file}.warc.wet.gz`;
}

/** Build requests against the single permitted remote data origin. */
export function fileUrl(file: FileRef): string {
  return `${DATA_ORIGIN}/${filePath(file)}`;
}

/** Construct a crawl's path-list URL only after validating its identifier. */
export function pathsUrl(crawl: string): string {
  if (!crawlPattern.test(crawl)) throw new Error("Invalid crawl identifier.");
  return `${DATA_ORIGIN}/crawl-data/${crawl}/wet.paths.gz`;
}

/** Parse exactly one canonical path without URL normalization or traversal. */
export function parseFilePath(value: string): FileRef | null {
  const match = pathPattern.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return { crawl: match[1], segment: match[2], file: match[3] };
}

/** Parse the hash grammar without interpolating unchecked strings into URLs. */
export function parseRoute(hash: string): Route {
  if (!hash || hash === "#/") return { kind: "home" };
  const invalid = { kind: "invalid" } as const;
  if (!hash.startsWith("#/")) return invalid;
  const pieces = hash.slice(2).split("?");
  if (pieces.length > 2) return invalid;
  const parts = (pieces[0] ?? "").split("/");
  const [kind, crawl, segment, id, range] = parts;
  const query = pieces[1];
  if (!crawl || !crawlPattern.test(crawl)) return invalid;
  if (kind === "c" && query === undefined) {
    if (parts.length === 2) return { kind: "crawl", crawl };
    if (parts.length === 3 && segment && segmentPattern.test(segment))
      return { kind: "segment", crawl, segment };
  }
  if (!segment || !id) return invalid;
  const file = { crawl, segment, file: id };
  if (!validFile(file)) return invalid;
  if (kind === "f" && parts.length === 4) {
    if (query === undefined) return { kind: "file", file };
    const match = /^from=(\d+)$/.exec(query);
    const from = integer(match?.[1]);
    return from === null ? invalid : { kind: "file", file, from };
  }
  if (kind === "r" && parts.length === 5 && query === undefined) {
    const match = /^(\d+)-(\d+)$/.exec(range ?? "");
    const offset = integer(match?.[1]);
    const length = integer(match?.[2]);
    if (
      offset !== null &&
      length !== null &&
      length > 0 &&
      Number.isSafeInteger(offset + length)
    )
      return { kind: "record", file, offset, length };
  }
  return invalid;
}

/** Serialize only routes that pass the same strict parser used on navigation. */
export function routeHash(route: Exclude<Route, { kind: "invalid" }>): string {
  let hash = "#/";
  if (route.kind === "crawl") hash += `c/${route.crawl}`;
  if (route.kind === "segment") hash += `c/${route.crawl}/${route.segment}`;
  if (route.kind === "file" || route.kind === "record") {
    const { crawl, segment, file } = route.file;
    hash += `${route.kind === "file" ? "f" : "r"}/${crawl}/${segment}/${file}`;
    if (route.kind === "record") hash += `/${route.offset}-${route.length}`;
    else if (route.from !== undefined) hash += `?from=${route.from}`;
  }
  if (parseRoute(hash).kind === "invalid") throw new Error("Invalid route.");
  return hash;
}

/** Normalize human file references without issuing a request or guessing a path. */
export function parseJump(value: string): Jump | null {
  const input = value.trim();
  const position = integer(input);
  if (position !== null) return { kind: "position", position };
  if (new RegExp(`^CC-MAIN-${FILE}\\.warc\\.wet\\.gz$`).test(input))
    return { kind: "filename", filename: input };
  const path = input
    .replace(/^https:\/\/data\.commoncrawl\.org\//, "")
    .replace(/^s3:\/\/commoncrawl\//, "");
  const file = parseFilePath(path);
  if (file) return { kind: "file", file };
  let hash = input;
  if (!hash.startsWith("#")) {
    try {
      const url = new URL(input);
      if (!/^https?:$/.test(url.protocol)) return null;
      hash = url.hash;
    } catch {
      return null;
    }
  }
  const route = parseRoute(hash);
  return route.kind === "record" || route.kind === "file" ? route : null;
}
