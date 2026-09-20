/** Verify that compact metadata does not retain discarded WARC header blocks. */
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "vitest";
import type { RecordMeta } from "./record.ts";

const execute = promisify(execFile);

test("retained metadata releases oversized unused headers", async () => {
  const { stdout, stderr } = await execute(
    process.execPath,
    [
      "--expose-gc",
      fileURLToPath(new URL("../../tests/metadata-memory.ts", import.meta.url)),
    ],
    { timeout: 15000, windowsHide: true },
  );
  const result = JSON.parse(stdout) as {
    growth: number;
    metadata: RecordMeta[];
  };
  expect(stderr).toBe("");
  expect(result.metadata).toHaveLength(8);
  expect(
    result.metadata.every(
      (record) =>
        record.title === "Small record" &&
        record.host === "example.org" &&
        record.recordId === "urn:uuid:00000000-0000-4000-8000-000000000001" &&
        !record.damaged,
    ),
  ).toBe(true);
  expect(result.growth).toBeLessThan(8 * 1024 * 1024);
}, 20000);
