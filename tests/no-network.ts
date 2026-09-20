/** Fail accidental network access; fixture tests install their own fetch. */
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("Live network calls are forbidden in automated tests.");
  });
});

afterEach(() => vi.unstubAllGlobals());
