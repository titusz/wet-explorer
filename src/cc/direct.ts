/** Read a permanent link's single member without downloading a crawl manifest. */
import {
  type ReadOptions,
  readRanges,
  type SourceEvent,
} from "./bytesource.ts";
import { type RecordMeta, recordMeta } from "./record.ts";
import { type FileRef, fileUrl, routeHash } from "./urls.ts";
import { parseWarc } from "./warc.ts";

export interface RecordLocation {
  file: FileRef;
  offset: number;
  length: number;
}
export interface RecordData {
  meta: RecordMeta;
  raw: Uint8Array;
  payload: Uint8Array;
}
interface RecordOptions
  extends Omit<ReadOptions, "start" | "end" | "safeOffset"> {
  onEvent?: (event: SourceEvent) => void;
}

export class InvalidRecordLinkError extends Error {
  /** Distinguish bad record positions from recoverable transport failures. */
  constructor(cause?: unknown) {
    super("This link does not point to a record.", { cause });
    this.name = "InvalidRecordLinkError";
  }
}

/** Assemble received bytes without allocating from an untrusted declared length. */
function join(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Decode the single gzip member using the browser's native stream decoder. */
async function decode(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  try {
    const source = new Response(bytes).body;
    if (!source) throw new Error("Missing record bytes.");
    return new Uint8Array(
      await new Response(
        source.pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer(),
    );
  } catch (error) {
    throw new InvalidRecordLinkError(error);
  }
}

/** Fetch only the known member and keep raw bytes available for the raw view. */
export async function fetchRecord(
  reference: RecordLocation,
  options: RecordOptions,
): Promise<RecordData> {
  routeHash({ kind: "record", ...reference });
  const chunks: Uint8Array[] = [];
  for await (const event of readRanges(fileUrl(reference.file), {
    ...options,
    start: reference.offset,
    end: reference.offset + reference.length - 1,
    safeOffset: () => reference.offset,
  })) {
    if (event.kind === "restart") chunks.length = 0;
    if (event.kind === "chunk") chunks.push(event.data);
    options.onEvent?.(event);
  }
  options.signal.throwIfAborted();
  const compressed = join(chunks);
  if (compressed.length !== reference.length)
    throw new InvalidRecordLinkError();
  const raw = await decode(compressed);
  options.signal.throwIfAborted();
  if (new TextDecoder().decode(raw.subarray(0, 8)) !== "WARC/1.0")
    throw new InvalidRecordLinkError();
  const parsed = parseWarc(raw);
  return {
    meta: recordMeta(parsed, {
      index: null,
      offset: reference.offset,
      length: reference.length,
    }),
    raw,
    payload: parsed.payload,
  };
}
