/** Turn concatenated gzip bytes into independently addressable WET members. */
import { Gunzip } from "fflate";

export interface Member {
  offset: number;
  length: number;
  data: Uint8Array;
}

export class MemberStream {
  private readonly decoder: Gunzip;
  private readonly start: number;
  private readonly emit: (member: Member) => void;
  private chunks: Uint8Array[] = [];
  private size = 0;
  private received = 0;
  private readonly trailer = new Uint8Array(8);
  private ended = false;
  safeOffset: number;

  /** Start at an independently decodable absolute member boundary. */
  constructor(start: number, emit: (member: Member) => void) {
    this.start = start;
    this.safeOffset = start;
    this.emit = emit;
    this.decoder = new Gunzip((chunk) => {
      if (chunk.length) {
        this.chunks.push(chunk);
        this.size += chunk.length;
      }
    });
    this.decoder.onmember = (offset) => this.complete(start + offset);
  }

  /** Consume bytes immediately; completed members can appear before range end. */
  push(bytes: Uint8Array): void {
    if (this.ended) throw new Error("Member stream has ended.");
    this.received += bytes.length;
    if (bytes.length >= 8) this.trailer.set(bytes.subarray(-8));
    else if (bytes.length) {
      this.trailer.copyWithin(0, bytes.length);
      this.trailer.set(bytes, 8 - bytes.length);
    }
    this.decoder.push(bytes, false);
  }

  /** Finish only at actual file EOF, never at a range boundary or abort. */
  finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.decoder.push(new Uint8Array(), true);
    const finalLength = this.start + this.received - this.safeOffset;
    const declaredSize = new DataView(this.trailer.buffer).getUint32(4, true);
    if (finalLength < 18 || declaredSize !== this.size % 2 ** 32) {
      throw new Error(
        "The final gzip member has an incomplete or invalid trailer.",
      );
    }
    this.complete(this.start + this.received);
  }

  /** Assemble a member only after its end is established by the decoder. */
  private complete(end: number): void {
    if (end <= this.safeOffset) return;
    const data = new Uint8Array(this.size);
    let position = 0;
    for (const chunk of this.chunks) {
      data.set(chunk, position);
      position += chunk.length;
    }
    const member = {
      offset: this.safeOffset,
      length: end - this.safeOffset,
      data,
    };
    this.chunks = [];
    this.size = 0;
    this.safeOffset = end;
    this.emit(member);
  }
}
