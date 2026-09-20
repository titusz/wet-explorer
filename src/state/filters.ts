/** Filter only the metadata already received and summarize completed local reads. */
import type { RecordMeta } from "../cc/record.ts";

export interface Filters {
  text: string;
  language: string;
  hideShort: boolean;
}

/** Start each file with all records represented, including short records. */
export function emptyFilters(): Filters {
  return { text: "", language: "", hideShort: false };
}

/** Match only advertised metadata fields without implying unseen or full-text search. */
export function filterRows(
  rows: readonly RecordMeta[],
  filters: Filters,
): readonly RecordMeta[] {
  const text = filters.text.trim().toLocaleLowerCase("en");
  if (!text && !filters.language && !filters.hideShort) return rows;
  return rows.filter(
    (row) =>
      (!filters.hideShort || !row.short) &&
      (!filters.language ||
        (filters.language === "unknown"
          ? !row.languages.length
          : row.languages.includes(filters.language))) &&
      (!text ||
        row.title.toLocaleLowerCase("en").includes(text) ||
        (row.host ?? "").toLocaleLowerCase("en").includes(text)),
  );
}

/** Count dominant languages once per record and keep the summary to three languages. */
export function summarizeRows(rows: readonly RecordMeta[]) {
  const languages = new Map<string, number>();
  let short = 0;
  for (const row of rows) {
    if (row.short) short++;
    const code = row.languages[0] ?? "unknown";
    languages.set(code, (languages.get(code) ?? 0) + 1);
  }
  return {
    records: rows.length,
    short,
    languages: [...languages]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3),
  };
}
