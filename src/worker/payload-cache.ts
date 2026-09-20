/** Retain raw record bytes within a fixed least-recently-used memory budget. */
export const PAYLOAD_BUDGET = 32 * 1024 * 1024;

export class PayloadCache {
  private readonly entries = new Map<number, Uint8Array>();
  private readonly limit: number;
  private retained = 0;

  /** Set the maximum retained buffer bytes for this file's cache. */
  constructor(limit = PAYLOAD_BUDGET) {
    this.limit = limit;
  }

  /** Report retained bytes, including headers needed by the raw view. */
  get bytes(): number {
    return this.retained;
  }

  /** Touch a cached record so recent selections survive subsequent eviction. */
  get(offset: number): Uint8Array | undefined {
    const bytes = this.entries.get(offset);
    if (bytes) {
      this.entries.delete(offset);
      this.entries.set(offset, bytes);
    }
    return bytes;
  }

  /** Store owned bytes and evict older records until the byte budget holds. */
  put(offset: number, bytes: Uint8Array): boolean {
    const previous = this.entries.get(offset);
    if (previous) {
      this.retained -= previous.length;
      this.entries.delete(offset);
    }
    if (bytes.length > this.limit) return false;
    while (this.retained + bytes.length > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.retained -= this.entries.get(oldest)?.length ?? 0;
      this.entries.delete(oldest);
    }
    const owned =
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes
        : bytes.slice();
    this.entries.set(offset, owned);
    this.retained += owned.length;
    return true;
  }

  /** Release payload buffers when navigation opens another file. */
  clear(): void {
    this.entries.clear();
    this.retained = 0;
  }
}
