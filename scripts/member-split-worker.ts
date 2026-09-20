/** Verify a disjoint set of every possible split in the entire real fixture. */
import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { type Member, MemberStream } from "../src/cc/members.ts";

const { first, last } = workerData as { first: number; last: number };
const bytes = new Uint8Array(
  readFileSync(
    new URL("../tests/fixtures/real-head.warc.wet.gz", import.meta.url),
  ),
);
const expected: Member[] = [];
const reference = new MemberStream(0, (member) => expected.push(member));
reference.push(bytes);
reference.finish();

/** Compare payload bytes as well as absolute positions, lengths, and count. */
function checkSplit(split: number): void {
  let index = 0;
  const decoder = new MemberStream(0, (member) => {
    const target = expected[index++];
    if (
      !target ||
      target.offset !== member.offset ||
      target.length !== member.length ||
      !Buffer.from(
        member.data.buffer,
        member.data.byteOffset,
        member.data.byteLength,
      ).equals(target.data)
    ) {
      throw new Error(`Member ${index} differs at split ${split}.`);
    }
  });
  decoder.push(bytes.subarray(0, split));
  decoder.push(bytes.subarray(split));
  decoder.finish();
  if (index !== expected.length)
    throw new Error(`Member count differs at split ${split}.`);
}

for (let split = first; split < last; split++) checkSplit(split);
parentPort?.postMessage(last - first);
