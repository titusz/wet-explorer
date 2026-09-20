/** Own one file stream, its metadata and payload cache, and serialized network jobs. */
import {
  createReadSession,
  InterruptedError,
  type ReadOptions,
  readRanges,
  type SourceEvent,
} from "../cc/bytesource.ts";
import { fetchRecord, InvalidRecordLinkError } from "../cc/direct.ts";
import { type Member, MemberStream } from "../cc/members.ts";
import { MetadataPool } from "../cc/metadata-pool.ts";
import { fetchPaths } from "../cc/paths.ts";
import { type RecordMeta, recordMeta } from "../cc/record.ts";
import { type FileRef, fileUrl } from "../cc/urls.ts";
import { parseWarc } from "../cc/warc.ts";
import { PayloadCache } from "./payload-cache.ts";
import type {
  ReaderCommand,
  ReaderEvent,
  StreamProgress,
  StreamState,
} from "./protocol.ts";

const READ_AHEAD = 200;
type Job = Extract<
  ReaderCommand,
  { type: "open" | "continue" | "fetchRecord" | "paths" }
>;
export interface ReaderOptions {
  source?: Pick<ReadOptions, "fetcher" | "retryDelays" | "stallMs" | "random">;
  reportMode?: (mode: "range" | "stream") => void;
}
class ReadAheadReached extends Error {}

/** Compare file identity without normalizing untrusted path components. */
function sameFile(first: FileRef | null, second: FileRef): boolean {
  return (
    first?.crawl === second.crawl &&
    first.segment === second.segment &&
    first.file === second.file
  );
}

export class ReaderEngine {
  private readonly post: (event: ReaderEvent) => void;
  private readonly options: ReaderOptions;
  private readonly session;
  private readonly cache = new PayloadCache();
  private readonly metadata = new Map<number, RecordMeta>();
  private readonly metadataPool = new MetadataPool();
  private pending: RecordMeta[] = [];
  private notified = false;
  private file: FileRef | null = null;
  private streamId = -1;
  private state: StreamState = "paused";
  private position = 0;
  private size: number | null = null;
  private safeOffset = 0;
  private rowCount = 0;
  private nextIndex: number | null = 0;
  private lastVisible = -1;
  private targetRows = READ_AHEAD;
  private manualPause = false;
  private countdown: number | null = null;
  private finishing = false;
  private epoch = 0;
  private controller: AbortController | null = null;
  private jobType: Job["type"] | null = null;
  private operation: Promise<void> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private resumeAfterJob: "automatic" | "manual" | null = null;

  /** Bind event delivery and transport options without involving the page DOM. */
  constructor(post: (event: ReaderEvent) => void, options: ReaderOptions = {}) {
    this.post = post;
    this.options = options;
    this.session = createReadSession(options.reportMode);
  }

  /** Report retained payload bytes for worker memory-budget measurements. */
  get cacheBytes(): number {
    return this.cache.bytes;
  }

  /** Wait for the current job and its response cleanup to settle. */
  idle(): Promise<void> {
    return this.operation;
  }

  /** Handle navigation and frame credits while fetch/decode work remains asynchronous. */
  handle(command: ReaderCommand): void {
    if (command.type === "stop") {
      this.stop();
      return;
    }
    if (
      "streamId" in command &&
      command.type !== "open" &&
      command.streamId !== this.streamId
    )
      return;
    if (command.type === "flush") {
      this.flush();
      return;
    }
    if (command.type === "visible") {
      if (!Number.isSafeInteger(command.index)) return;
      this.lastVisible = Math.max(
        -1,
        Math.min(command.index, this.rowCount - 1),
      );
      this.targetRows = this.lastVisible + 1 + READ_AHEAD;
      if (
        this.state === "paused" &&
        !this.manualPause &&
        this.rowCount - this.lastVisible - 1 < READ_AHEAD / 2
      ) {
        if (this.jobType === "fetchRecord" || this.jobType === "paths")
          this.resumeAfterJob ??= "automatic";
        else this.launch({ type: "continue", streamId: this.streamId }, true);
      }
      return;
    }
    if (command.type === "pause") {
      this.manualPause = true;
      this.resumeAfterJob = null;
      if (this.jobType === "open" || this.jobType === "continue") {
        this.epoch++;
        this.controller?.abort();
        clearInterval(this.heartbeat);
        this.jobType = null;
      }
      if (this.state !== "complete") this.setState("paused");
      return;
    }
    if (command.type === "continue") {
      if (this.state === "complete" || !this.file) return;
      if (this.jobType === "fetchRecord" || this.jobType === "paths") {
        this.resumeAfterJob = "manual";
        return;
      }
    }
    if (command.type === "fetchRecord" && sameFile(this.file, command.file)) {
      const meta = this.metadata.get(command.offset);
      const raw =
        meta?.length === command.length
          ? this.cache.get(command.offset)
          : undefined;
      if (raw && meta) {
        this.emitRecord(command.requestId, raw, meta);
        return;
      }
    }
    this.launch(command, false);
  }

  /** Cancel any active I/O before a replacement job can issue another request. */
  private launch(command: Job, automatic: boolean): void {
    const epoch = ++this.epoch;
    this.controller?.abort();
    clearInterval(this.heartbeat);
    this.jobType = command.type;
    if (command.type === "fetchRecord" || command.type === "paths") {
      if (this.state === "reading" || this.state === "connecting")
        this.setState("paused");
    }
    this.operation = this.runAfter(this.operation, epoch, command, automatic);
  }

  /** Serialize jobs and suppress events belonging to superseded navigation. */
  private async runAfter(
    previous: Promise<void>,
    epoch: number,
    command: Job,
    automatic: boolean,
  ): Promise<void> {
    await previous;
    if (epoch !== this.epoch) return;
    const controller = new AbortController();
    this.controller = controller;
    this.jobType = command.type;
    try {
      if (command.type === "open" || command.type === "continue") {
        if (command.type === "open") this.reset(command);
        else {
          this.manualPause = false;
          this.targetRows = automatic
            ? this.lastVisible + 1 + READ_AHEAD
            : Math.max(
                this.rowCount + READ_AHEAD,
                this.lastVisible + 1 + READ_AHEAD,
              );
          this.setState(this.rowCount ? "reading" : "connecting");
        }
        this.heartbeat = setInterval(() => {
          if (epoch === this.epoch) this.progress();
        }, 200);
        await this.read(epoch, controller.signal);
      } else if (command.type === "fetchRecord") {
        const record = await fetchRecord(command, {
          ...this.options.source,
          session: this.session,
          signal: controller.signal,
          onEvent: (event) =>
            this.recordProgress(command.requestId, event, epoch),
        });
        if (epoch !== this.epoch) return;
        const known = sameFile(this.file, command.file)
          ? this.metadata.get(command.offset)
          : undefined;
        if (sameFile(this.file, command.file))
          this.cache.put(command.offset, record.raw);
        this.emitRecord(command.requestId, record.raw, known ?? record.meta);
      } else {
        const paths = await fetchPaths(command.crawl, controller.signal);
        if (epoch === this.epoch)
          this.post({ type: "paths", requestId: command.requestId, paths });
      }
    } catch (error) {
      if (epoch !== this.epoch || controller.signal.aborted) return;
      if (error instanceof ReadAheadReached) this.setState("paused");
      else if (command.type === "open" || command.type === "continue") {
        this.setState("interrupted");
        this.post({
          type: "error",
          scope: "stream",
          id: this.streamId,
          code: "interrupted",
        });
      } else {
        this.post({
          type: "error",
          scope: command.type === "paths" ? "paths" : "record",
          id: command.requestId,
          code:
            error instanceof InvalidRecordLinkError
              ? "invalid-link"
              : error instanceof InterruptedError
                ? "interrupted"
                : "unavailable",
        });
      }
    } finally {
      controller.abort();
      if (epoch === this.epoch) {
        clearInterval(this.heartbeat);
        this.controller = null;
        this.jobType = null;
        if (this.resumeAfterJob && this.file) {
          const automatic = this.resumeAfterJob === "automatic";
          this.resumeAfterJob = null;
          this.launch({ type: "continue", streamId: this.streamId }, automatic);
        }
      }
    }
  }

  /** Reset all per-file state only after the preceding response is released. */
  private reset(command: Extract<Job, { type: "open" }>): void {
    fileUrl(command.file);
    this.file = command.file;
    this.streamId = command.streamId;
    this.safeOffset = command.start ?? 0;
    this.position = this.safeOffset;
    this.size = null;
    this.rowCount = 0;
    this.nextIndex = this.safeOffset === 0 ? 0 : null;
    this.lastVisible = -1;
    this.targetRows = READ_AHEAD;
    this.manualPause = false;
    this.finishing = false;
    this.countdown = null;
    this.notified = false;
    this.resumeAfterJob = null;
    this.pending = [];
    this.metadata.clear();
    this.metadataPool.clear();
    this.cache.clear();
    this.setState("connecting");
  }

  /** Inflate and parse in this worker until EOF, cancellation, or read-ahead rest. */
  private async read(epoch: number, signal: AbortSignal): Promise<void> {
    if (!this.file) return;
    let decoder = new MemberStream(this.safeOffset, (member) =>
      this.accept(member, epoch, signal),
    );
    for await (const event of readRanges(fileUrl(this.file), {
      ...this.options.source,
      session: this.session,
      start: this.safeOffset,
      signal,
      safeOffset: () => this.safeOffset,
    })) {
      signal.throwIfAborted();
      if (epoch !== this.epoch) return;
      if (event.kind === "restart")
        decoder = new MemberStream(event.offset, (member) =>
          this.accept(member, epoch, signal),
        );
      if (event.kind === "chunk") {
        this.position = Math.max(this.position, event.position);
        this.size = event.total;
        this.countdown = null;
        if (this.state !== "reading") this.setState("reading");
        // Gunzip copies the unused input after each member; bound those temporary copies.
        for (let offset = 0; offset < event.data.length; offset += 16384)
          decoder.push(event.data.subarray(offset, offset + 16384));
      }
      if (event.kind === "locating") {
        this.position = Math.max(this.position, event.position);
        this.size = event.total;
        this.progress();
      }
      if (event.kind === "waiting") {
        this.countdown = event.seconds;
        if (this.state !== "reading") this.setState("reading");
        this.progress();
      }
      if (event.kind === "complete") {
        this.finishing = true;
        decoder.finish();
        this.finishing = false;
        this.position = event.total;
        this.size = event.total;
        this.setState("complete");
      }
    }
  }

  /** Keep all metadata, retain bounded raw bytes, and stop at a whole member. */
  private accept(member: Member, epoch: number, signal: AbortSignal): void {
    signal.throwIfAborted();
    if (epoch !== this.epoch)
      throw new DOMException("Reading superseded.", "AbortError");
    this.safeOffset = member.offset + member.length;
    if (this.metadata.has(member.offset)) return;
    const meta = this.metadataPool.share(
      recordMeta(parseWarc(member.data), {
        index: this.nextIndex,
        offset: member.offset,
        length: member.length,
      }),
    );
    if (this.nextIndex !== null) this.nextIndex++;
    this.metadata.set(member.offset, meta);
    this.cache.put(member.offset, member.data);
    if (meta.type === "warcinfo")
      this.post({ type: "fileInfo", streamId: this.streamId, meta });
    else {
      this.rowCount++;
      this.pending.push(meta);
      if (!this.notified) {
        this.notified = true;
        this.post({ type: "rowsAvailable", streamId: this.streamId });
      }
      if (!this.finishing && this.rowCount >= this.targetRows)
        throw new ReadAheadReached();
    }
  }

  /** Emit at most one bounded batch for the page's outstanding animation-frame credit. */
  private flush(): void {
    const rows = this.pending.splice(0, 100);
    const more = this.pending.length > 0;
    this.notified = more;
    this.post({ type: "rows", streamId: this.streamId, rows, more });
  }

  /** Decode only the opened record, keeping all remote values as plain strings. */
  private emitRecord(
    requestId: number,
    raw: Uint8Array,
    meta: RecordMeta,
  ): void {
    const parsed = parseWarc(raw);
    this.post({
      type: "record",
      requestId,
      record: {
        meta,
        headers: parsed.headers,
        text: new TextDecoder().decode(parsed.payload),
        rawText: new TextDecoder().decode(raw),
      },
    });
  }

  /** Translate transport progress for a standalone record skeleton. */
  private recordProgress(
    requestId: number,
    event: SourceEvent,
    epoch: number,
  ): void {
    if (
      epoch !== this.epoch ||
      event.kind === "restart" ||
      event.kind === "complete"
    )
      return;
    this.post({
      type: "recordProgress",
      requestId,
      locating: event.kind === "locating",
      bytesRead: event.kind === "waiting" ? 0 : event.position,
      size: event.kind === "waiting" ? null : event.total,
      countdown: event.kind === "waiting" ? event.seconds : null,
    });
  }

  /** Publish totals only once the complete file has been consumed and parsed. */
  private snapshot(): StreamProgress {
    return {
      bytesRead: this.position,
      size: this.size,
      rows: this.rowCount,
      safeOffset: this.safeOffset,
      countdown: this.countdown,
      ...(this.state === "complete" && this.nextIndex !== null
        ? { totalRecords: this.rowCount }
        : {}),
    };
  }

  /** Announce a stream state immediately while keeping waiting subordinate to reading. */
  private setState(state: StreamState): void {
    this.state = state;
    if (state !== "reading") this.countdown = null;
    this.post({
      type: "state",
      streamId: this.streamId,
      state,
      progress: this.snapshot(),
    });
  }

  /** Keep the status bar live during connecting, reading, and backoff. */
  private progress(): void {
    this.post({
      type: "progress",
      streamId: this.streamId,
      progress: this.snapshot(),
    });
  }

  /** Cancel all work and release file metadata and raw buffers on navigation. */
  private stop(): void {
    this.epoch++;
    this.controller?.abort();
    clearInterval(this.heartbeat);
    this.resumeAfterJob = null;
    this.jobType = null;
    this.file = null;
    this.streamId = -1;
    this.pending = [];
    this.metadata.clear();
    this.metadataPool.clear();
    this.cache.clear();
    this.post({ type: "stopped" });
  }
}
