/** Check list-window boundaries at the beginning, middle, and end of a large file. */
import { expect, test } from "vitest";
import { rowWindow } from "./window.ts";

test("20,000 rows render only the visible region and a small overscan", () => {
  const middle = rowWindow(20000, 520000, 676);
  expect(middle).toEqual({ start: 9994, end: 10019, lastVisible: 10012 });
  expect(rowWindow(20000, 0, 676)).toEqual({
    start: 0,
    end: 19,
    lastVisible: 12,
  });
  expect(rowWindow(20000, 1040000, 676).end).toBe(20000);
});

test("an empty or shortened list cannot retain an out-of-bounds window", () => {
  expect(rowWindow(0, 9000, 676)).toEqual({
    start: 0,
    end: 0,
    lastVisible: -1,
  });
  expect(rowWindow(2, 9000, 676)).toEqual({ start: 0, end: 2, lastVisible: 1 });
});
