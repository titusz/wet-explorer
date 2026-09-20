/** Parse one decoded WARC member without assuming complete or valid headers. */
export interface WarcRecord {
  headers: Record<string, string>;
  payload: Uint8Array;
  damaged: boolean;
}

/** Locate the byte delimiter without decoding any record payload. */
function headerEnd(bytes: Uint8Array): number {
  for (let index = 0; index + 3 < bytes.length; index++) {
    if (
      bytes[index] === 13 &&
      bytes[index + 1] === 10 &&
      bytes[index + 2] === 13 &&
      bytes[index + 3] === 10
    )
      return index;
  }
  return -1;
}

/** Split header bytes without creating a shared decoded string for every field. */
function* headerLines(bytes: Uint8Array): Generator<Uint8Array> {
  let start = 0;
  for (let end = 0; end + 1 < bytes.length; end++) {
    if (bytes[end] !== 13 || bytes[end + 1] !== 10) continue;
    yield bytes.subarray(start, end);
    start = end + 2;
    end++;
  }
  yield bytes.subarray(start);
}

/** Detect invalid UTF-8 while allowing replacement decoding by consumers. */
function validUtf8(bytes: Uint8Array): boolean {
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      const end = Math.min(bytes.length, offset + 4096);
      decoder.decode(bytes.subarray(offset, end), {
        stream: end < bytes.length,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** Slice content by its byte length and report damage without dropping a row. */
export function parseWarc(bytes: Uint8Array): WarcRecord {
  const boundary = headerEnd(bytes);
  const headers: Record<string, string> = Object.create(null);
  const decoder = new TextDecoder();
  const lines = headerLines(
    bytes.subarray(0, boundary < 0 ? bytes.length : boundary),
  );
  let damaged =
    decoder.decode(lines.next().value) !== "WARC/1.0" || boundary < 0;
  for (const line of lines) {
    const colon = line.indexOf(58);
    if (colon < 1) {
      damaged = true;
      continue;
    }
    const name = decoder.decode(line.subarray(0, colon)).trim().toLowerCase();
    headers[name] = decoder.decode(line.subarray(colon + 1)).trim();
  }
  const body = boundary < 0 ? new Uint8Array() : bytes.subarray(boundary + 4);
  const hasTrailer =
    body.length >= 4 &&
    body[body.length - 4] === 13 &&
    body[body.length - 3] === 10 &&
    body[body.length - 2] === 13 &&
    body[body.length - 1] === 10;
  const available = body.length - (hasTrailer ? 4 : 0);
  const declared = headers["content-length"];
  const length = declared && /^\d+$/.test(declared) ? Number(declared) : NaN;
  const validLength = Number.isSafeInteger(length) && length >= 0;
  damaged ||= !hasTrailer || !validLength || length !== available;
  const payload = body.subarray(
    0,
    validLength ? Math.min(length, available) : available,
  );
  damaged ||= !validUtf8(payload);
  return { headers, payload, damaged };
}
