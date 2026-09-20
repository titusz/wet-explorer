/** Check every real-fixture split, distributing only CPU work across threads. */
import { statSync } from "node:fs";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { expect, test } from "vitest";

/** Run one finite partition and surface thread failures to the test runner. */
function partition(first: number, last: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../scripts/member-split-worker.ts", import.meta.url),
      { workerData: { first, last } },
    );
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) reject(new Error(`Split worker exited ${code}.`));
    });
  });
}

test("every byte position in the full 50-member real fixture is chunk invariant", {
  timeout: 3600000,
}, async () => {
  const count = statSync("tests/fixtures/real-head.warc.wet.gz").size + 1;
  const threads = Math.min(8, availableParallelism());
  const stride = Math.ceil(count / threads);
  const tasks: Promise<number>[] = [];
  for (let first = 0; first < count; first += stride)
    tasks.push(partition(first, Math.min(count, first + stride)));
  expect(
    (await Promise.all(tasks)).reduce((sum, value) => sum + value, 0),
  ).toBe(150186);
});
