/** Parse Common Crawl's published archive tables without a runtime index. */
export interface Crawl {
  id: string;
  label: string;
  year: number;
  pages: number;
  files?: number;
  wetTiB?: number;
}

/** Extract plain table-cell text from trusted build-time archive HTML. */
function cells(row: string): string[] {
  return [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
    (match[1] ?? "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim(),
  );
}

/** Read release names and page counts, rejecting missing or duplicate data. */
export function parseCatalogue(html: string): Crawl[] {
  const crawls: Crawl[] = [];
  const seen = new Set<string>();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const [id, label, billions] = cells(row[1] ?? "");
    if (!id || !/^CC-MAIN-\d{4}-\d{2}$/.test(id)) continue;
    if (
      !label ||
      !billions ||
      !Number.isFinite(Number(billions)) ||
      seen.has(id)
    ) {
      throw new Error(`Invalid catalogue entry: ${id}`);
    }
    seen.add(id);
    if (id < "CC-MAIN-2013-20") continue;
    crawls.push({
      id,
      label,
      year: Number(id.slice(8, 12)),
      pages: Math.round(Number(billions) * 1e9),
    });
  }
  if (!crawls.length) throw new Error("Archive table is missing.");
  return crawls.sort((a, b) => b.id.localeCompare(a.id));
}

/** Read WET statistics rather than the much larger all-format archive size. */
export function parseWetStats(html: string): { files: number; wetTiB: number } {
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const [type, , count, size] = cells(row[1] ?? "");
    if (type !== "WET") continue;
    const files = Number(count?.replaceAll(",", ""));
    const wetTiB = Number(size);
    if (Number.isSafeInteger(files) && files > 0 && wetTiB > 0)
      return { files, wetTiB };
  }
  throw new Error("WET statistics are missing.");
}
