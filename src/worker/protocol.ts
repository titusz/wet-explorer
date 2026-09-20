/** Define the page/reader messages without exposing compressed bytes to the UI. */
import type { PathsIndex } from "../cc/paths.ts";
import type { RecordMeta } from "../cc/record.ts";
import type { FileRef } from "../cc/urls.ts";

export type StreamState =
  | "connecting"
  | "reading"
  | "paused"
  | "complete"
  | "interrupted";

export interface StreamProgress {
  bytesRead: number;
  size: number | null;
  rows: number;
  safeOffset: number;
  countdown: number | null;
  totalRecords?: number;
}

export interface OpenRecord {
  meta: RecordMeta;
  headers: Record<string, string>;
  text: string;
  rawText: string;
}

export type ReaderCommand =
  | { type: "open"; streamId: number; file: FileRef; start?: number }
  | { type: "continue"; streamId: number }
  | { type: "pause"; streamId: number }
  | { type: "visible"; streamId: number; index: number }
  | { type: "flush"; streamId: number }
  | { type: "stop" }
  | {
      type: "fetchRecord";
      requestId: number;
      file: FileRef;
      offset: number;
      length: number;
    }
  | { type: "paths"; requestId: number; crawl: string };

export type ReaderEvent =
  | {
      type: "state";
      streamId: number;
      state: StreamState;
      progress: StreamProgress;
    }
  | { type: "progress"; streamId: number; progress: StreamProgress }
  | { type: "rowsAvailable"; streamId: number }
  | { type: "rows"; streamId: number; rows: RecordMeta[]; more: boolean }
  | { type: "fileInfo"; streamId: number; meta: RecordMeta }
  | { type: "record"; requestId: number; record: OpenRecord }
  | {
      type: "recordProgress";
      requestId: number;
      locating: boolean;
      bytesRead: number;
      size: number | null;
      countdown: number | null;
    }
  | { type: "paths"; requestId: number; paths: PathsIndex }
  | {
      type: "error";
      scope: "stream" | "record" | "paths";
      id: number;
      code: "interrupted" | "invalid-link" | "unavailable";
    }
  | { type: "stopped" };
