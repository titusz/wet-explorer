/** Keep bounded visit metadata and preferences locally, without storing record contents. */
import { parseFilePath, parseRoute } from "../cc/urls.ts";

export const STORAGE_KEY = "wetx:v1";
export type Theme = "system" | "light" | "dark";
export interface Visit {
  bytesRead: number;
  size: number | null;
  rows: number;
  from: number;
}
export interface Preferences {
  version: 1;
  noticeDismissed: boolean;
  theme: Theme;
  last: { route: string; scrollIndex: number } | null;
  visited: Record<string, Visit>;
}
interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Return fresh defaults when this browser has no usable local state. */
export function emptyPreferences(): Preferences {
  return {
    version: 1,
    noticeDismissed: false,
    theme: "system",
    last: null,
    visited: {},
  };
}

/** Reading the storage property itself can throw in restricted browsing contexts. */
function browserStorage(): StoragePort | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Validate counts and byte positions without accepting numeric coercion. */
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Retain only known fields and valid canonical routes from untrusted local storage. */
export function parsePreferences(value: unknown): Preferences {
  const defaults = emptyPreferences();
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1
  )
    return defaults;
  const source = value as Record<string, unknown>;
  defaults.noticeDismissed = source.noticeDismissed === true;
  if (source.theme === "light" || source.theme === "dark")
    defaults.theme = source.theme;
  if (source.last && typeof source.last === "object") {
    const last = source.last as Record<string, unknown>;
    const route =
      typeof last.route === "string" ? parseRoute(last.route) : null;
    if (
      (route?.kind === "file" || route?.kind === "record") &&
      count(last.scrollIndex)
    )
      defaults.last = {
        route: last.route as string,
        scrollIndex: last.scrollIndex,
      };
  }
  if (
    source.visited &&
    typeof source.visited === "object" &&
    !Array.isArray(source.visited)
  ) {
    for (const [path, value] of Object.entries(source.visited)) {
      if (!parseFilePath(path) || !value || typeof value !== "object") continue;
      const visit = value as Record<string, unknown>;
      if (
        !count(visit.bytesRead) ||
        !count(visit.rows) ||
        !count(visit.from) ||
        visit.from > visit.bytesRead ||
        (visit.size !== null &&
          (!count(visit.size) || visit.size < visit.bytesRead))
      )
        continue;
      defaults.visited[path] = {
        bytesRead: visit.bytesRead,
        size: visit.size as number | null,
        rows: visit.rows,
        from: visit.from,
      };
    }
    defaults.visited = Object.fromEntries(
      Object.entries(defaults.visited).slice(-200),
    );
  }
  return defaults;
}

/** Treat denied access, invalid JSON and obsolete versions as an empty browser history. */
export function readPreferences(storage = browserStorage()): Preferences {
  try {
    return parsePreferences(
      JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null"),
    );
  } catch {
    return emptyPreferences();
  }
}

/** Keep quota and privacy-mode failures invisible to normal browsing. */
export function writePreferences(
  preferences: Preferences,
  storage = browserStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Local state is optional. */
  }
}

/** Refresh insertion order and evict the least recently visited file beyond the cap. */
export function rememberVisit(
  visited: Preferences["visited"],
  path: string,
  visit: Visit,
): Preferences["visited"] {
  return Object.fromEntries(
    [
      ...Object.entries(visited).filter(([key]) => key !== path),
      [path, visit] as const,
    ].slice(-200),
  );
}

/** Count only bytes actually traversed, including reads that began at a permanent link. */
export function visitFraction(visit: Visit): number | null {
  return visit.size
    ? Math.min(1, Math.max(0, visit.bytesRead - visit.from) / visit.size)
    : null;
}
