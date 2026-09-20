/** Stream bounded, cache-aligned ranges and resume failures at safe members. */
export const GRID_BYTES = 4 * 1024 * 1024;
export const RETRY_DELAYS = [2000, 4000, 8000, 16000, 32000] as const;

export type SourceEvent =
  | { kind: "restart"; offset: number }
  | { kind: "chunk"; data: Uint8Array; position: number; total: number | null }
  | { kind: "locating"; position: number; total: number | null }
  | { kind: "waiting"; seconds: number; attempt: number }
  | { kind: "complete"; total: number };

export interface ReadOptions {
  start: number;
  end?: number;
  signal: AbortSignal;
  safeOffset: () => number;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
  random?: () => number;
  stallMs?: number;
  retryDelays?: readonly number[];
  session?: ReadSession;
}

export interface ReadSession {
  mode: "unknown" | "range" | "stream";
  probed: boolean;
  report: (mode: "range" | "stream") => void;
}

interface RangeResult {
  position: number;
  total: number | null;
  complete: boolean;
}

/** Report the selected transport once without exposing it in the product UI. */
function logMode(mode: "range" | "stream"): void {
  console.info(
    `WET Explorer: ${mode === "range" ? "ranged reads" : "streaming compatibility path"} active.`,
  );
}

/** Share compatibility detection across file opens for the lifetime of a worker. */
export function createReadSession(report = logMode): ReadSession {
  return { mode: "unknown", probed: false, report };
}

const defaultSession = createReadSession();

/** Record positive transport evidence without repeatedly logging it. */
function selectMode(session: ReadSession, mode: "range" | "stream"): void {
  if (session.mode !== "unknown") return;
  session.mode = mode;
  session.report(mode);
}

export class InterruptedError extends Error {
  readonly offset: number;
  /** Retain the first un-emitted member so user continuation is lossless. */
  constructor(offset: number, cause?: unknown) {
    super("Reading was interrupted. Continue from the last complete record.", {
      cause,
    });
    this.name = "InterruptedError";
    this.offset = offset;
  }
}

class ProtocolError extends Error {}
class RangeNetworkError extends TypeError {}

/** Bound a pending read and remove timers/listeners after every outcome. */
async function deadline<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number,
): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {});
    throw signal.reason;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  const interruption = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(
      () => reject(new TypeError("The response stalled.")),
      ms,
    );
  });
  try {
    return await Promise.race([promise, interruption]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/** Wait without retaining timers after navigation, pause, or stop. */
async function delay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: () => void = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(resolve, ms);
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/** Validate actual byte positions before passing any response bytes onward. */
function contentRange(
  response: Response,
  start: number,
  end: number,
): { last: number; total: number } {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(
    response.headers.get("Content-Range") ?? "",
  );
  const first = Number(match?.[1]);
  const last = Number(match?.[2]);
  const total = Number(match?.[3]);
  if (
    !match ||
    ![first, last, total].every(Number.isSafeInteger) ||
    first !== start ||
    last < first ||
    last > end ||
    total <= last
  ) {
    throw new ProtocolError("The host returned an invalid Content-Range.");
  }
  return { last, total };
}

/** Classify only a failed ranged fetch, excluding HTTP errors and stalled bodies. */
async function request(
  url: string,
  init: RequestInit,
  options: ReadOptions,
): Promise<Response> {
  try {
    const response = await (options.fetcher ?? fetch)(url, init);
    if (init.signal?.aborted) {
      await response.body?.cancel().catch(() => {});
      init.signal.throwIfAborted();
    }
    return response;
  } catch (error) {
    if (error instanceof TypeError && new Headers(init.headers).has("Range"))
      throw new RangeNetworkError("The ranged request failed.", {
        cause: error,
      });
    throw error;
  }
}

/** Stream a response with abort/stall handling and unconditional reader cleanup. */
async function* bodyChunks(
  response: Response,
  signal: AbortSignal,
  stallMs: number,
): AsyncGenerator<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw new TypeError("The response body is missing.");
  let idleSince = Date.now();
  try {
    while (true) {
      const remaining = stallMs - (Date.now() - idleSince);
      if (remaining <= 0) throw new TypeError("The response stalled.");
      const chunk = await deadline(reader.read(), signal, remaining);
      if (chunk.done) return;
      if (chunk.value.length) {
        yield chunk.value;
        idleSince = Date.now();
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Authorize the compatibility GET only after a successful ordinary HEAD. */
async function probeRange(
  url: string,
  options: ReadOptions,
  session: ReadSession,
): Promise<boolean> {
  if (session.mode !== "unknown" || session.probed) return false;
  session.probed = true;
  const controller = new AbortController();
  const signal = AbortSignal.any([options.signal, controller.signal]);
  let response: Response | undefined;
  try {
    response = await deadline(
      request(url, { method: "HEAD", signal }, options),
      signal,
      options.stallMs ?? 15000,
    );
    options.signal.throwIfAborted();
    if (!response.ok) return false;
    selectMode(session, "stream");
    return true;
  } catch {
    options.signal.throwIfAborted();
    return false;
  } finally {
    controller.abort();
    await response?.body?.cancel().catch(() => {});
  }
}

/** In compatibility mode, discard preceding bytes and abort at a wanted span. */
async function* plain(
  url: string,
  start: number,
  options: ReadOptions,
): AsyncGenerator<SourceEvent, RangeResult> {
  const controller = new AbortController();
  const signal = AbortSignal.any([options.signal, controller.signal]);
  let response: Response | undefined;
  try {
    response = await deadline(
      request(url, { signal }, options),
      signal,
      options.stallMs ?? 15000,
    );
    if (response.status === 503) throw new TypeError("Common Crawl is busy.");
    if (response.status !== 200)
      throw new ProtocolError(
        `Expected a 200 streaming response; received ${response.status}.`,
      );
    const length = response.headers.get("Content-Length");
    const total =
      length === null ? null : /^\d+$/.test(length) ? Number(length) : NaN;
    if (total !== null && (!Number.isSafeInteger(total) || total < 0))
      throw new ProtocolError("Invalid file size.");
    let position = 0;
    const limit = options.end === undefined ? Infinity : options.end + 1;
    yield { kind: "locating", position, total };
    for await (const chunk of bodyChunks(
      response,
      signal,
      options.stallMs ?? 15000,
    )) {
      const previous = position;
      position += chunk.length;
      if (total !== null && position > total)
        throw new ProtocolError("The response exceeds its file size.");
      yield { kind: "locating", position, total };
      const first = Math.max(start, previous);
      const last = Math.min(limit, position);
      if (last > first)
        yield {
          kind: "chunk",
          data: chunk.subarray(first - previous, last - previous),
          position,
          total,
        };
      if (position >= limit)
        return { position: limit, total, complete: limit === total };
    }
    if (total !== null && position !== total)
      throw new TypeError("The streaming response ended early.");
    return { position, total: total ?? position, complete: true };
  } finally {
    controller.abort();
    await response?.body?.cancel().catch(() => {});
  }
}

/** Keep one response in flight and release it even if its consumer stops. */
async function* range(
  url: string,
  start: number,
  options: ReadOptions,
): AsyncGenerator<SourceEvent, RangeResult> {
  const end =
    options.end ?? (Math.floor(start / GRID_BYTES) + 1) * GRID_BYTES - 1;
  const controller = new AbortController();
  const signal = AbortSignal.any([options.signal, controller.signal]);
  let response: Response | undefined;
  try {
    response = await deadline(
      request(
        url,
        {
          headers: { Range: `bytes=${start}-${end}` },
          signal,
        },
        options,
      ),
      signal,
      options.stallMs ?? 15000,
    );
    if (response.status === 503) throw new TypeError("Common Crawl is busy.");
    if (response.status !== 206)
      throw new ProtocolError(
        `Expected a 206 range response; received ${response.status}.`,
      );
    const { last, total } = contentRange(response, start, end);
    selectMode(options.session ?? defaultSession, "range");
    let position = start;
    for await (const chunk of bodyChunks(
      response,
      signal,
      options.stallMs ?? 15000,
    )) {
      position += chunk.length;
      if (position > last + 1)
        throw new ProtocolError("The response exceeds its byte range.");
      yield { kind: "chunk", data: chunk, position, total };
    }
    if (position !== last + 1)
      throw new TypeError(
        "The response ended before its byte range was complete.",
      );
    return { position, total, complete: position === total };
  } finally {
    controller.abort();
    await response?.body?.cancel().catch(() => {});
  }
}

/** Read forward on the fixed grid, rebuilding the decoder after each retry. */
export async function* readRanges(
  url: string,
  options: ReadOptions,
): AsyncGenerator<SourceEvent> {
  let position = options.start;
  let failures = 0;
  let safeAtFailure = position;
  const session = options.session ?? defaultSession;
  const delays = options.retryDelays ?? RETRY_DELAYS;
  if (!Number.isSafeInteger(position) || position < 0)
    throw new Error("Invalid start offset.");
  if (
    options.end !== undefined &&
    (!Number.isSafeInteger(options.end) || options.end < position)
  )
    throw new Error("Invalid end offset.");
  options.signal.throwIfAborted();
  yield { kind: "restart", offset: position };
  while (true) {
    options.signal.throwIfAborted();
    try {
      const result = yield* session.mode === "stream"
        ? plain(url, position, options)
        : range(url, position, options);
      position = result.position;
      if (result.complete) {
        yield { kind: "complete", total: result.total ?? result.position };
        return;
      }
      if (options.end !== undefined && position === options.end + 1) return;
    } catch (error) {
      options.signal.throwIfAborted();
      if (error instanceof ProtocolError || !(error instanceof TypeError))
        throw error;
      if (
        error instanceof RangeNetworkError &&
        (await probeRange(url, options, session))
      ) {
        position = options.safeOffset();
        yield { kind: "restart", offset: position };
        continue;
      }
      const safe = options.safeOffset();
      if (safe > safeAtFailure) failures = 0;
      safeAtFailure = safe;
      const pause = delays[failures++];
      if (pause === undefined) throw new InterruptedError(safe, error);
      const duration = pause * (0.8 + (options.random ?? Math.random)() * 0.4);
      const until = Date.now() + duration;
      yield {
        kind: "waiting",
        seconds: Math.ceil(duration / 1000),
        attempt: failures,
      };
      while (Date.now() < until) {
        await delay(
          Math.min(250, Math.max(0, until - Date.now())),
          options.signal,
        );
        if (Date.now() < until)
          yield {
            kind: "waiting",
            seconds: Math.ceil((until - Date.now()) / 1000),
            attempt: failures,
          };
      }
      position = safe;
      yield { kind: "restart", offset: position };
    }
  }
}
