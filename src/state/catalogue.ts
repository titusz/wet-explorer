/** Load the optional static crawl catalogue only when an older year is expanded. */
export const FIRST_SUPPORTED_CRAWL = "CC-MAIN-2017-22";

export interface Crawl {
  id: string;
  label: string;
  year: number;
  pages: number;
  files?: number;
  wetTiB?: number;
}

/** Reject malformed static entries before they can become selectable routes. */
export function parseCrawls(value: unknown): Crawl[] {
  if (!Array.isArray(value) || !value.length)
    throw new Error("No crawls available.");
  const seen = new Set<string>();
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.id !== "string" ||
      !/^CC-MAIN-\d{4}-\d{2}$/.test(entry.id) ||
      typeof entry.label !== "string" ||
      !entry.label.trim() ||
      entry.year !== Number(entry.id.slice(8, 12)) ||
      !Number.isSafeInteger(entry.pages) ||
      entry.pages < 0 ||
      seen.has(entry.id) ||
      (entry.files !== undefined &&
        (!Number.isSafeInteger(entry.files) || entry.files < 1)) ||
      (entry.wetTiB !== undefined &&
        (!Number.isFinite(entry.wetTiB) || entry.wetTiB <= 0))
    ) {
      throw new Error("The crawl list could not be read.");
    }
    seen.add(entry.id);
  }
  const supported = (value as Crawl[]).filter(
    (crawl) => crawl.id >= FIRST_SUPPORTED_CRAWL,
  );
  if (!supported.length) throw new Error("No compatible crawls available.");
  return supported.toSorted((a, b) => b.id.localeCompare(a.id));
}

/** Read only the app's static catalogue with a bounded wait. */
export async function loadCrawls(): Promise<Crawl[]> {
  const response = await fetch("./crawls.json", {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("The crawl list could not be loaded.");
  return parseCrawls(await response.json());
}
