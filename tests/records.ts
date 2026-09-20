/** Decode recorded fixture members into the same plain data used by reader views. */
import { readFileSync } from "node:fs";
import { MemberStream } from "../src/cc/members.ts";
import { recordMeta } from "../src/cc/record.ts";
import { parseWarc } from "../src/cc/warc.ts";
import type { OpenRecord } from "../src/worker/protocol.ts";

/** Read fixture metadata and text without making a network request. */
export function fixtureRecords(
  name = "synthetic-edge.warc.wet.gz",
): OpenRecord[] {
  const result: OpenRecord[] = [];
  const stream = new MemberStream(0, (member) => {
    const record = parseWarc(member.data);
    result.push({
      meta: recordMeta(record, {
        index: result.length,
        offset: member.offset,
        length: member.length,
      }),
      headers: record.headers,
      text: new TextDecoder().decode(record.payload),
      rawText: new TextDecoder().decode(member.data),
    });
  });
  stream.push(
    new Uint8Array(
      readFileSync(new URL(`./fixtures/${name}`, import.meta.url)),
    ),
  );
  stream.finish();
  return result;
}
