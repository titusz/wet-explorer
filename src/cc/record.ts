/** Derive compact display metadata without retaining decoded record strings. */
import type { WarcRecord } from "./warc.ts";

export interface RecordMeta {
  index: number | null;
  offset: number;
  length: number;
  type: string;
  url: string | null;
  host: string | null;
  date: string | null;
  languages: readonly string[];
  recordId: string;
  refersTo: string | null;
  digest: string | null;
  bytes: number;
  chars: number;
  lines: number;
  title: string;
  short: boolean;
  damaged: boolean;
}

/** Return a web URL only if following it cannot execute another protocol. */
export function webUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return /^(https?:)$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

/** Inspect bounded UTF-8 chunks, retaining only the first nonempty title. */
function textStats(payload: Uint8Array): {
  chars: number;
  lines: number;
  title: string;
} {
  const decoder = new TextDecoder();
  let chars = 0;
  let lines = payload.length ? 1 : 0;
  let title = "";
  let titleChars = 0;
  let titleDone = false;
  for (let offset = 0; offset < payload.length; offset += 4096) {
    const end = Math.min(payload.length, offset + 4096);
    const text = decoder.decode(payload.subarray(offset, end), {
      stream: end < payload.length,
    });
    for (const char of text) {
      chars++;
      if (char === "\n") lines++;
      if (titleDone) continue;
      if (char === "\n" || char === "\r") {
        if (title) titleDone = true;
        continue;
      }
      if (titleChars < 300 && (titleChars > 0 || char.trim())) {
        title += char;
        titleChars++;
      }
    }
  }
  return { chars, lines, title: title.trimEnd() };
}

/** Summarize Unicode text without materializing or retaining a payload string. */
export function recordMeta(
  record: WarcRecord,
  position: Pick<RecordMeta, "index" | "offset" | "length">,
): RecordMeta {
  const { headers, payload, damaged } = record;
  const { chars, lines, title: firstLine } = textStats(payload);
  const url = headers["warc-target-uri"] || null;
  const host = webUrl(url)?.hostname || null;
  const title = [...(firstLine || host || "")].slice(0, 300).join("");
  return {
    ...position,
    type: headers["warc-type"] || "unknown",
    url,
    host,
    date: headers["warc-date"] || null,
    languages: (headers["warc-identified-content-language"] || "")
      .split(/[,\s]+/)
      .filter(Boolean),
    recordId: headers["warc-record-id"] || "",
    refersTo: headers["warc-refers-to"] || null,
    digest: headers["warc-block-digest"] || null,
    bytes: payload.length,
    chars,
    lines,
    title,
    short: chars < 256,
    damaged,
  };
}
