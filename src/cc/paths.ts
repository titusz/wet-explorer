/** Fetch crawl file lists and resolve positions without a precomputed index. */
import {
  type FileRef,
  type Jump,
  parseFilePath,
  pathsUrl,
  type Route,
} from "./urls.ts";

export interface PathsIndex {
  crawl: string;
  files: FileRef[];
  segments: Map<string, FileRef[]>;
}

/** Retain manifest order for global file positions and per-segment grids. */
export function parsePaths(text: string, crawl: string): PathsIndex {
  const files: FileRef[] = [];
  const segments = new Map<string, FileRef[]>();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const file = parseFilePath(line);
    if (!file || file.crawl !== crawl)
      throw new Error("The file list contains an unsupported or invalid path.");
    const group = segments.get(file.segment) ?? [];
    group.push(file);
    segments.set(file.segment, group);
    files.push(file);
  }
  if (!files.length) throw new Error("The crawl's file list is empty.");
  return { crawl, files, segments };
}

/** Decode this single gzip member in the reader worker using the platform API. */
export async function fetchPaths(
  crawl: string,
  signal: AbortSignal,
): Promise<PathsIndex> {
  signal.throwIfAborted();
  const response = await fetch(pathsUrl(crawl), { signal });
  if (!response.ok || !response.body)
    throw new Error(
      `Cannot read this crawl's file list (${response.status}). Try again.`,
    );
  const text = await new Response(
    response.body.pipeThrough(new DecompressionStream("gzip")),
  ).text();
  signal.throwIfAborted();
  return parsePaths(text, crawl);
}

/** Select a uniform line rather than overweighting smaller segments. */
export function randomFile(index: PathsIndex, random = Math.random): FileRef {
  const value = random();
  if (!(value >= 0 && value < 1)) throw new Error("Invalid random value.");
  const file = index.files[Math.floor(value * index.files.length)];
  if (!file) throw new Error("There are no files to open.");
  return file;
}

/** Resolve ambiguous short forms within the chosen crawl and preserve direct links. */
export function resolveJump(
  jump: Jump,
  index: PathsIndex,
): Extract<Route, { kind: "file" | "record" }> | null {
  if (jump.kind === "file" || jump.kind === "record") return jump;
  const file =
    jump.kind === "position"
      ? index.files[jump.position]
      : index.files.find(
          (entry) => `CC-MAIN-${entry.file}.warc.wet.gz` === jump.filename,
        );
  return file ? { kind: "file", file } : null;
}
