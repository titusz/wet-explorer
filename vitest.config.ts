/** Keep unit tests isolated from browser tests and the live file host. */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    setupFiles: ["./tests/no-network.ts"],
  },
});
