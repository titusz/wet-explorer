/** Bound text rendering while retaining source characters and Unicode boundaries. */
export const TEXT_PAGE = 8000;

/** Promote the first nonempty source line to the reader heading. */
export function textHeading(
  text: string,
  fallback: string,
): { title: string; bodyStart: number } {
  let start = 0;
  while (start < text.length) {
    const newline = text.indexOf("\n", start);
    const end = newline < 0 ? text.length : newline;
    const title = text.slice(start, end).trim();
    if (title) return { title, bodyStart: newline < 0 ? end : end + 1 };
    start = end + 1;
  }
  return { title: fallback, bodyStart: 0 };
}

/** End a screenful near a newline, without splitting a UTF-16 surrogate pair. */
export function textPageEnd(text: string, start: number): number {
  let end = Math.min(text.length, start + TEXT_PAGE);
  if (end === text.length) return end;
  const newline = text.lastIndexOf("\n", end - 1);
  if (newline >= start + TEXT_PAGE / 2) return newline + 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  return end;
}

/** Split oversized headings into lossless sections for deferred browser layout. */
export function textPages(text: string): string[] {
  const pages: string[] = [];
  for (let start = 0; start < text.length; ) {
    const end = textPageEnd(text, start);
    pages.push(text.slice(start, end));
    start = end;
  }
  return pages;
}

/** Choose a bounded tail without starting inside a surrogate pair. */
export function textTailStart(text: string): number {
  let start = Math.max(0, text.length - TEXT_PAGE);
  const first = text.charCodeAt(start);
  if (first >= 0xdc00 && first <= 0xdfff) start++;
  return start;
}

/** Count Unicode code points without allocating an array. */
export function characterCount(text: string): number {
  let count = 0;
  for (const _character of text) count++;
  return count;
}

/** Retain both ends of a long identifier; expanded and copied values stay whole. */
export function middle(value: string, limit = 64): string {
  if (value.length <= limit) return value;
  const half = Math.floor((limit - 1) / 2);
  return `${value.slice(0, half)}…${value.slice(-half)}`;
}
