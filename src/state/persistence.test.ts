/** Verify optional local state, strict validation, and the two-hundred-file limit. */
import { expect, test } from "vitest";
import { filePath } from "../cc/urls.ts";
import {
  emptyPreferences,
  parsePreferences,
  readPreferences,
  rememberVisit,
  visitFraction,
  writePreferences,
} from "./persistence.ts";

const file = {
  crawl: "CC-MAIN-2026-34",
  segment: "1786091384908.68",
  file: "20260807101845-20260807131845-00000",
};
const visit = { bytesRead: 380, size: 1000, rows: 7840, from: 0 };

test("prefs round-trip through one versioned key without payload text", () => {
  const storage = new Map<string, string>();
  const port = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };
  const prefs = {
    ...emptyPreferences(),
    theme: "dark" as const,
    noticeDismissed: true,
    last: {
      route:
        "#/r/CC-MAIN-2026-34/1786091384908.68/20260807101845-20260807131845-00000/11692-1799",
      scrollIndex: 1,
    },
    visited: { [filePath(file)]: visit },
  };
  writePreferences(prefs, port);
  expect([...storage.keys()]).toEqual(["wetx:v1"]);
  expect(readPreferences(port)).toEqual(prefs);
});

test("missing, denied, broken and obsolete storage never breaks browsing", () => {
  expect(readPreferences(null)).toEqual(emptyPreferences());
  for (const raw of [
    "{broken",
    "null",
    JSON.stringify({ ...emptyPreferences(), version: 2 }),
  ])
    expect(readPreferences({ getItem: () => raw, setItem: () => {} })).toEqual(
      emptyPreferences(),
    );
  const denied = {
    getItem: () => {
      throw new Error("Denied");
    },
    setItem: () => {
      throw new Error("Quota");
    },
  };
  expect(readPreferences(denied)).toEqual(emptyPreferences());
  expect(() => writePreferences(emptyPreferences(), denied)).not.toThrow();
});

test("invalid routes and counters are discarded rather than restored or requested", () => {
  const prefs = parsePreferences({
    version: 1,
    theme: "anything",
    last: { route: "javascript:bad", scrollIndex: -1 },
    visited: {
      [filePath(file)]: { ...visit, bytesRead: 2000 },
      __proto__: visit,
      "../bad": visit,
    },
  });
  expect(prefs).toEqual(emptyPreferences());
  expect(
    parsePreferences({
      version: 1,
      visited: { [filePath(file)]: { ...visit, from: 500 } },
    }).visited,
  ).toEqual({});
});

test("visits are capped at 200 and opening an existing file refreshes its position", () => {
  let visited = emptyPreferences().visited;
  const keys = Array.from({ length: 201 }, (_, i) =>
    filePath({
      ...file,
      file: `20260807101845-20260807131845-${String(i).padStart(5, "0")}`,
    }),
  );
  for (const key of keys.slice(0, 200))
    visited = rememberVisit(visited, key, visit);
  visited = rememberVisit(visited, keys[0] ?? "", visit);
  visited = rememberVisit(visited, keys[200] ?? "", visit);
  expect(Object.keys(visited)).toHaveLength(200);
  expect(visited[keys[0] ?? ""]).toEqual(visit);
  expect(visited[keys[1] ?? ""]).toBeUndefined();
  expect(
    Object.keys(
      parsePreferences({
        version: 1,
        visited: Object.fromEntries(keys.map((key) => [key, visit])),
      }).visited,
    ),
  ).toHaveLength(200);
});

test("forward reads do not claim that skipped bytes have been read", () => {
  expect(visitFraction(visit)).toBe(0.38);
  expect(visitFraction({ ...visit, from: 300 })).toBe(0.08);
  expect(visitFraction({ ...visit, size: null })).toBeNull();
});
