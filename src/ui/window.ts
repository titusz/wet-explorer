/** Calculate a bounded window of the design's fixed-height record rows. */
export const ROW_HEIGHT = 52;
const OVERSCAN = 6;

/** Include nearby rows while clamping stale scroll positions after list changes. */
export function rowWindow(count: number, top: number, height: number) {
  const first = Math.min(
    Math.max(0, count - 1),
    Math.floor(Math.max(0, top) / ROW_HEIGHT),
  );
  const last = Math.min(
    count,
    first + Math.ceil(Math.max(0, height) / ROW_HEIGHT),
  );
  return {
    start: Math.max(0, first - OVERSCAN),
    end: Math.min(count, last + OVERSCAN),
    lastVisible: last - 1,
  };
}
