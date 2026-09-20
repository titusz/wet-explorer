/** Format compact identifiers and honest byte counts consistently across the UI. */
export const number = new Intl.NumberFormat("en");
const languages = new Intl.DisplayNames(["en"], { type: "language" });

/** Retain source codes without allowing malformed language tags to throw. */
export function languageName(code: string): string {
  if (code === "unknown") return "Language unknown";
  try {
    return languages.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Use decimal units matching the design's network and payload size labels. */
export function bytes(value: number): string {
  if (value < 1000) return `${value} B`;
  if (value < 1000000) return `${(value / 1000).toFixed(1)} KB`;
  return `${(value / 1000000).toFixed(1)} MB`;
}
