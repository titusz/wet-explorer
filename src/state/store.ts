/** Keep observable application state separate from rendering and worker transport. */

import type { PathsIndex } from "../cc/paths.ts";
import type { RecordMeta } from "../cc/record.ts";
import type { FileRef, Route } from "../cc/urls.ts";
import type {
  OpenRecord,
  ReaderEvent,
  StreamProgress,
  StreamState,
} from "../worker/protocol.ts";
import type { Crawl } from "./catalogue.ts";
import { emptyFilters, type Filters } from "./filters.ts";
import recent from "./landing-crawls.json";
import {
  emptyPreferences,
  type Preferences,
  readPreferences,
} from "./persistence.ts";

export type PathsState =
  | { status: "loading"; requestId: number }
  | { status: "ready"; index: PathsIndex }
  | { status: "error" };

export interface Stream extends StreamProgress {
  id: number;
  file: FileRef;
  from: number;
  state: StreamState;
}

export interface AppState {
  route: Route;
  crawls: {
    selected: string;
    recent: Crawl[];
    all: Crawl[] | null;
    status: "idle" | "loading" | "ready" | "error";
  };
  paths: ReadonlyMap<string, PathsState>;
  intent: {
    kind: "random" | "jump" | "next";
    pending: boolean;
    error: string | null;
  } | null;
  stream: Stream | null;
  filters: Filters;
  prefs: Preferences;
  rows: readonly RecordMeta[];
  fileInfo: RecordMeta | null;
  selection: {
    requestId: number;
    record: OpenRecord | null;
    error: string | null;
    iscc?:
      | { state: "idle"; error?: true }
      | { state: "computing" }
      | { state: "ready"; code: string };
    progress?: Omit<
      Extract<ReaderEvent, { type: "recordProgress" }>,
      "type" | "requestId"
    >;
    waitingNext?: boolean;
  } | null;
}

export class Store {
  state: AppState = {
    route: { kind: "home" },
    crawls: {
      selected: recent[0]?.id ?? "CC-MAIN-2026-34",
      recent,
      all: null,
      status: "idle",
    },
    paths: new Map(),
    intent: null,
    stream: null,
    filters: emptyFilters(),
    prefs: emptyPreferences(),
    rows: [],
    fileInfo: null,
    selection: null,
  };
  private readonly listeners = new Set<() => void>();

  /** Accept restored preferences without reading browser storage in isolated stores. */
  constructor(prefs = emptyPreferences()) {
    this.state.prefs = prefs;
  }

  /** Replace changed slices and notify subscribers once per update. */
  update(change: Partial<AppState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }

  /** Subscribe until the returned cleanup is called. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const store = new Store(readPreferences());
