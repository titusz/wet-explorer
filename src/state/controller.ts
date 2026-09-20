/** Translate application intents into reader commands with one batch credit per frame. */

import { randomFile, resolveJump } from "../cc/paths.ts";
import type { RecordMeta } from "../cc/record.ts";
import {
  type FileRef,
  filePath,
  type Jump,
  parseJump,
  parseRoute,
  pathsUrl,
  type Route,
  routeHash,
} from "../cc/urls.ts";
import type { ReaderCommand, ReaderEvent } from "../worker/protocol.ts";
import { type Crawl, loadCrawls } from "./catalogue.ts";
import { emptyFilters, type Filters } from "./filters.ts";
import { IsccController } from "./iscc.ts";
import {
  type Preferences,
  rememberVisit,
  writePreferences,
} from "./persistence.ts";
import { type PathsState, type Store, store } from "./store.ts";

export interface ReaderPort {
  postMessage(command: ReaderCommand): void;
  onmessage: ((event: MessageEvent<ReaderEvent>) => void) | null;
  terminate(): void;
}
interface Frames {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}
type Destination = Exclude<Route, { kind: "invalid" }>;

export class Controller {
  private readonly store: Store;
  private readonly worker: ReaderPort;
  private readonly frames: Frames;
  private frame: number | null = null;
  private credit = false;
  private sequence = 0;
  private pendingNext: number | null = null;
  private readonly go: (route: Destination) => void;
  private pendingPaths: { crawl: string; id: number } | null = null;
  private pendingIntent: {
    crawl: string;
    jump?: Jump;
    nextFile?: FileRef;
  } | null = null;
  private readonly catalogue: () => Promise<Crawl[]>;
  private viewportIndex = 0;
  private persistenceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly iscc: IsccController;

  /** Attach a worker and a frame clock without coupling the store to browser APIs. */
  constructor(
    store: Store,
    worker: ReaderPort,
    frames: Frames,
    go?: (route: Destination) => void,
    catalogue = loadCrawls,
  ) {
    this.store = store;
    this.iscc = new IsccController(store);
    this.worker = worker;
    this.frames = frames;
    this.go = go ?? ((route) => this.navigate(route));
    this.catalogue = catalogue;
    worker.onmessage = (event) => this.receive(event.data);
  }

  /** Reproduce a validated URL while retaining an existing list for its record links. */
  navigate(route: Route): void {
    this.remember();
    this.pendingNext = null;
    this.pendingIntent = null;
    const existing = this.store.state.stream;
    this.store.update({ route, intent: null });
    if (route.kind !== "file" && route.kind !== "record") {
      this.cancelFrame();
      const crawl =
        route.kind === "crawl" || route.kind === "segment" ? route.crawl : null;
      if (!this.pendingPaths || this.pendingPaths.crawl !== crawl) {
        this.forgetPaths();
        this.worker.postMessage({ type: "stop" });
      }
      this.store.update({
        stream: null,
        rows: [],
        fileInfo: null,
        selection: null,
      });
      if (crawl) {
        this.store.update({
          crawls: { ...this.store.state.crawls, selected: crawl },
        });
        this.ensurePaths(crawl);
      }
      return;
    }
    this.forgetPaths();
    const same = existing && filePath(existing.file) === filePath(route.file);
    if (route.kind === "file") {
      this.store.update({ selection: null });
      if (same && existing.from === (route.from ?? 0)) return;
      this.open(route.file, route.from ?? 0);
    } else {
      if (!same) {
        this.cancelFrame();
        this.worker.postMessage({ type: "stop" });
        this.store.update({ stream: null, rows: [], fileInfo: null });
      }
      const requestId = ++this.sequence;
      this.store.update({
        selection: { requestId, record: null, error: null },
      });
      this.worker.postMessage({
        type: "fetchRecord",
        requestId,
        file: route.file,
        offset: route.offset,
        length: route.length,
      });
    }
  }

  /** Update a chosen month and start only its small file list. */
  chooseCrawl(crawl: string): void {
    pathsUrl(crawl);
    this.pendingIntent = null;
    this.store.update({
      crawls: { ...this.store.state.crawls, selected: crawl },
      intent: null,
    });
    this.ensurePaths(crawl);
  }

  /** Load older months once, retaining the initial six when the static host fails. */
  async olderCrawls(): Promise<void> {
    const { crawls } = this.store.state;
    if (crawls.status === "loading" || crawls.status === "ready") return;
    this.store.update({ crawls: { ...crawls, status: "loading" } });
    try {
      const all = await this.catalogue();
      this.store.update({
        crawls: { ...this.store.state.crawls, all, status: "ready" },
      });
    } catch {
      this.store.update({
        crawls: { ...this.store.state.crawls, status: "error" },
      });
    }
  }

  /** Keep only completed manifests cached; canceled loads may be requested again. */
  private forgetPaths(): void {
    if (!this.pendingPaths) return;
    const paths = new Map(this.store.state.paths);
    paths.delete(this.pendingPaths.crawl);
    this.pendingPaths = null;
    this.store.update({ paths });
  }

  /** Replace one crawl's manifest state without copying file metadata. */
  private setPaths(crawl: string, state: PathsState): void {
    this.store.update({
      paths: new Map(this.store.state.paths).set(crawl, state),
    });
  }

  /** Deduplicate intent prefetch and explicit loads through the reader worker. */
  ensurePaths(crawl: string, retry = false): void {
    pathsUrl(crawl);
    const current = this.store.state.paths.get(crawl);
    if (current && (current.status !== "error" || !retry)) return;
    this.forgetPaths();
    const id = ++this.sequence;
    this.pendingPaths = { crawl, id };
    this.setPaths(crawl, { status: "loading", requestId: id });
    this.worker.postMessage({ type: "paths", requestId: id, crawl });
  }

  /** Choose one manifest line uniformly after the explicit random-file action. */
  random(crawl = this.store.state.crawls.selected): void {
    this.pendingIntent = { crawl };
    this.store.update({
      intent: { kind: "random", pending: true, error: null },
    });
    this.ensurePaths(crawl, true);
    this.finishIntent();
  }

  /** Change only the local list scope; filters never issue a request. */
  filter(filters: Partial<Filters>): void {
    this.store.update({ filters: { ...this.store.state.filters, ...filters } });
  }

  /** Delegate a visible panel's intent to the independently loaded Text-Code worker. */
  computeIscc(requestId: number): void {
    this.iscc.compute(requestId);
  }

  /** Store preferences immediately in memory and coalesce optional disk writes. */
  preferences(
    change: Partial<Pick<Preferences, "theme" | "noticeDismissed">>,
  ): void {
    this.store.update({ prefs: { ...this.store.state.prefs, ...change } });
    this.persistSoon();
  }

  /** Track the first visible unfiltered record for a precise return position. */
  position(index: number): void {
    if (index === this.viewportIndex || index < 0) return;
    this.viewportIndex = index;
    this.remember();
  }

  /** Preserve the visible record and bytes traversed, never inferred records or skipped bytes. */
  private remember(): void {
    const { route, stream, rows, selection, prefs } = this.store.state;
    if (route.kind !== "file" && route.kind !== "record") return;
    if (route.kind === "record" && !selection?.record) return;
    if (route.kind === "file" && !rows.length && stream?.state !== "complete")
      return;
    const first = rows[this.viewportIndex];
    const position =
      route.kind === "file"
        ? {
            ...route,
            from:
              this.viewportIndex > 0 && first
                ? first.offset
                : (stream?.from ?? route.from ?? 0),
          }
        : route;
    const visited =
      stream && (stream.rows > 0 || stream.state === "complete")
        ? rememberVisit(prefs.visited, filePath(stream.file), {
            bytesRead: stream.bytesRead,
            size: stream.size,
            rows: stream.rows,
            from: stream.from,
          })
        : prefs.visited;
    this.store.update({
      prefs: {
        ...prefs,
        last: { route: routeHash(position), scrollIndex: this.viewportIndex },
        visited,
      },
    });
    this.persistSoon();
  }

  /** Avoid synchronous storage work on every streamed batch or scroll event. */
  private persistSoon(): void {
    this.persistenceTimer ??= setTimeout(() => this.save(), 500);
  }

  /** Flush the small metadata snapshot when the page is hidden or closed. */
  save(): void {
    if (this.persistenceTimer === undefined) return;
    clearTimeout(this.persistenceTimer);
    this.persistenceTimer = undefined;
    writePreferences(this.store.state.prefs);
  }

  /** Resolve the next manifest line only after the end-of-file action is chosen. */
  nextFile(file: FileRef): void {
    this.pendingIntent = { crawl: file.crawl, nextFile: file };
    this.store.update({ intent: { kind: "next", pending: true, error: null } });
    this.ensurePaths(file.crawl, true);
    this.finishIntent();
  }

  /** Resolve every accepted reference and keep invalid input next to the field. */
  jump(value: string, crawl = this.store.state.crawls.selected): void {
    const jump = parseJump(value);
    this.pendingIntent = null;
    if (!jump) {
      this.store.update({
        intent: {
          kind: "jump",
          pending: false,
          error:
            "That reference was not understood. Try a file number, file name or Common Crawl link.",
        },
      });
      return;
    }
    if (jump.kind === "file" || jump.kind === "record") {
      this.go(jump);
      return;
    }
    this.pendingIntent = { crawl, jump };
    this.store.update({ intent: { kind: "jump", pending: true, error: null } });
    this.ensurePaths(crawl, true);
    this.finishIntent();
  }

  /** Complete only the latest unresolved navigation action using its chosen crawl. */
  private finishIntent(): void {
    const pending = this.pendingIntent;
    if (!pending) return;
    const paths = this.store.state.paths.get(pending.crawl);
    if (!paths || paths.status === "loading") return;
    this.pendingIntent = null;
    const kind = pending.nextFile ? "next" : pending.jump ? "jump" : "random";
    if (paths.status === "error") {
      this.store.update({
        intent: {
          kind,
          pending: false,
          error: "The file list could not be loaded. Try again.",
        },
      });
      return;
    }
    const currentFile = pending.nextFile;
    const nextIndex = currentFile
      ? paths.index.files.findIndex(
          (file) => filePath(file) === filePath(currentFile),
        )
      : -1;
    const next = nextIndex >= 0 ? paths.index.files[nextIndex + 1] : undefined;
    const route = pending.nextFile
      ? next
        ? { kind: "file" as const, file: next }
        : null
      : pending.jump
        ? resolveJump(pending.jump, paths.index)
        : { kind: "file" as const, file: randomFile(paths.index) };
    if (route) this.go(route);
    else
      this.store.update({
        intent: {
          kind,
          pending: false,
          error: pending.nextFile
            ? "There is no next file in this crawl. Open a random file or choose another crawl."
            : `No file at that position or with that name in ${pending.crawl}.`,
        },
      });
  }

  /** Start a file stream without discarding an already displayed standalone record. */
  private open(file: FileRef, from: number): void {
    this.cancelFrame();
    this.viewportIndex = 0;
    const id = ++this.sequence;
    this.store.update({
      stream: {
        id,
        file,
        from,
        state: "connecting",
        bytesRead: from,
        size: null,
        rows: 0,
        safeOffset: from,
        countdown: null,
      },
      rows: [],
      fileInfo: null,
      filters: emptyFilters(),
    });
    this.worker.postMessage({ type: "open", streamId: id, file, start: from });
  }

  /** Find only an adjacent record whose position is known in this list. */
  private adjacent(direction: -1 | 1): RecordMeta | undefined {
    const { route, rows, stream } = this.store.state;
    if (route.kind !== "record") return;
    if (direction === -1 && stream?.from !== 0) return;
    const index = rows.findIndex((row) => row.offset === route.offset);
    if (index >= 0) return rows[index + direction];
    if (direction === 1)
      return rows.find((row) => row.offset === route.offset + route.length);
  }

  /** Keep unavailable previous records and known EOF out of the action path. */
  canStep(direction: -1 | 1): boolean {
    const { route, selection, stream, rows } = this.store.state;
    if (route.kind !== "record" || !selection?.record || selection.waitingNext)
      return false;
    if (this.adjacent(direction)) return true;
    if (direction === -1) return false;
    const size = stream?.size ?? selection.progress?.size;
    if (
      size !== undefined &&
      size !== null &&
      route.offset + route.length >= size
    )
      return false;
    return stream?.state !== "complete" || rows.length < stream.rows;
  }

  /** Open a known neighbor or read forward until the next complete metadata row arrives. */
  step(direction: -1 | 1): void {
    const { route, selection, rows } = this.store.state;
    if (route.kind !== "record" || !selection || !this.canStep(direction))
      return;
    const neighbor = this.adjacent(direction);
    if (neighbor) {
      this.go({
        kind: "record",
        file: route.file,
        offset: neighbor.offset,
        length: neighbor.length,
      });
      return;
    }
    this.pendingNext = route.offset;
    this.store.update({ selection: { ...selection, waitingNext: true } });
    if (rows.some((row) => row.offset === route.offset))
      this.playback("continue");
    else this.open(route.file, route.offset + route.length);
  }

  /** Finish a pending Next intent only after the worker's final row batches are delivered. */
  private finishNext(): void {
    const { route, stream, rows, selection } = this.store.state;
    if (
      route.kind !== "record" ||
      this.pendingNext !== route.offset ||
      !selection
    )
      return;
    const next = this.adjacent(1);
    if (next) {
      this.pendingNext = null;
      this.go({
        kind: "record",
        file: route.file,
        offset: next.offset,
        length: next.length,
      });
    } else if (
      stream?.state === "interrupted" ||
      (stream?.state === "complete" && rows.length >= stream.rows)
    ) {
      this.pendingNext = null;
      this.store.update({ selection: { ...selection, waitingNext: false } });
    }
  }

  /** Start or pause reading through the current stream's identity. */
  playback(type: "pause" | "continue"): void {
    const stream = this.store.state.stream;
    if (stream) this.worker.postMessage({ type, streamId: stream.id });
  }

  /** Report the last visible unfiltered list position for automatic read-ahead. */
  visible(index: number): void {
    const stream = this.store.state.stream;
    if (stream)
      this.worker.postMessage({ type: "visible", streamId: stream.id, index });
  }

  /** Build the canonical record route from metadata already validated by the reader. */
  recordRoute(meta: RecordMeta): string {
    const stream = this.store.state.stream;
    return stream
      ? routeHash({
          kind: "record",
          file: stream.file,
          offset: meta.offset,
          length: meta.length,
        })
      : "#/";
  }

  /** Ignore superseded messages and notify the UI only with matching worker results. */
  private receive(event: ReaderEvent): void {
    if (event.type === "paths" && event.requestId === this.pendingPaths?.id) {
      const crawl = this.pendingPaths.crawl;
      this.pendingPaths = null;
      this.setPaths(crawl, { status: "ready", index: event.paths });
      this.finishIntent();
      return;
    }
    if (
      event.type === "error" &&
      event.scope === "paths" &&
      event.id === this.pendingPaths?.id
    ) {
      const crawl = this.pendingPaths.crawl;
      this.pendingPaths = null;
      this.setPaths(crawl, { status: "error" });
      this.finishIntent();
      return;
    }
    const stream = this.store.state.stream;
    if ("streamId" in event && event.streamId !== stream?.id) return;
    if (event.type === "rowsAvailable") this.schedule();
    else if (event.type === "rows") {
      this.credit = false;
      this.store.update({ rows: [...this.store.state.rows, ...event.rows] });
      if (event.more) this.schedule();
    } else if (
      (event.type === "state" || event.type === "progress") &&
      stream
    ) {
      this.store.update({
        stream: {
          ...stream,
          ...event.progress,
          state: event.type === "state" ? event.state : stream.state,
        },
      });
    } else if (event.type === "fileInfo")
      this.store.update({ fileInfo: event.meta });
    else if (
      event.type === "record" &&
      event.requestId === this.store.state.selection?.requestId
    ) {
      this.store.update({
        selection: {
          ...this.store.state.selection,
          requestId: event.requestId,
          record: event.record,
          error: null,
        },
      });
    } else if (
      event.type === "recordProgress" &&
      event.requestId === this.store.state.selection?.requestId
    ) {
      this.store.update({
        selection: {
          ...this.store.state.selection,
          progress: {
            locating: event.locating,
            bytesRead: event.bytesRead,
            size: event.size,
            countdown: event.countdown,
          },
        },
      });
    } else if (
      event.type === "error" &&
      event.scope === "record" &&
      event.id === this.store.state.selection?.requestId
    ) {
      this.store.update({
        selection: { requestId: event.id, record: null, error: event.code },
      });
    }
    this.finishNext();
    this.remember();
  }

  /** Ask for one batch on the next frame only when no prior credit is outstanding. */
  private schedule(): void {
    if (this.frame !== null || this.credit) return;
    this.frame = this.frames.request(() => {
      this.frame = null;
      const stream = this.store.state.stream;
      if (!stream) return;
      this.credit = true;
      this.worker.postMessage({ type: "flush", streamId: stream.id });
    });
  }

  /** Release queued rendering work when changing files or closing the application. */
  private cancelFrame(): void {
    if (this.frame !== null) this.frames.cancel(this.frame);
    this.frame = null;
    this.credit = false;
  }

  /** Dispose the reader and its scheduled frame. */
  dispose(): void {
    this.save();
    this.cancelFrame();
    this.worker.onmessage = null;
    this.worker.terminate();
    this.iscc.dispose();
  }
}

let active: Controller | undefined;

/** Create the reader once, only when the application starts in a browser. */
export function startController(): Controller {
  active ??= new Controller(
    store,
    new Worker(new URL("../worker/reader.worker.ts", import.meta.url), {
      type: "module",
    }),
    {
      request: (callback) => requestAnimationFrame(callback),
      cancel: (id) => cancelAnimationFrame(id),
    },
    (route) => {
      location.hash = routeHash(route);
    },
  );
  return active;
}

/** Apply the current hash using the same validator as all permanent links. */
export function routeChanged(): void {
  startController().navigate(parseRoute(location.hash || "#/"));
}
