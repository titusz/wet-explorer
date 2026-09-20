/** Share short repeated metadata values within one file without retaining payload text. */
import type { RecordMeta } from "./record.ts";

const MAX_VALUES = 256;

/** Keep a bounded dictionary while allowing uncommon values to be collected. */
function remember<T>(values: Map<string, T>, key: string, value: T): T {
  if (values.size >= MAX_VALUES) {
    const oldest = values.keys().next().value;
    if (oldest !== undefined) values.delete(oldest);
  }
  values.set(key, value);
  return value;
}

export class MetadataPool {
  private readonly strings = new Map<string, string>();
  private readonly languages = new Map<string, readonly string[]>();

  /** Return equivalent metadata with shared repeated fields and immutable language lists. */
  share(meta: RecordMeta): RecordMeta {
    return {
      ...meta,
      type: this.text(meta.type) ?? meta.type,
      date: this.text(meta.date),
      host: this.text(meta.host),
      languages: this.languageList(meta.languages),
    };
  }

  /** Reuse short values while leaving unique identifiers and unbounded fields untouched. */
  private text(value: string | null): string | null {
    if (value === null || value.length > 256) return value;
    return this.strings.get(value) ?? remember(this.strings, value, value);
  }

  /** Share common language combinations without conflating their order or values. */
  private languageList(values: readonly string[]): readonly string[] {
    if (values.length > 3 || values.some((value) => value.length > 8))
      return values;
    const key = JSON.stringify(values);
    return (
      this.languages.get(key) ??
      remember(this.languages, key, Object.freeze([...values]))
    );
  }

  /** Release per-file dictionary references on navigation. */
  clear(): void {
    this.strings.clear();
    this.languages.clear();
  }
}
