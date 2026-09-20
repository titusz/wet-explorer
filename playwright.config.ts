/** Exercise the static output in all three supported browser engines. */
import { defineConfig, devices } from "@playwright/test";

const engines = [
  { name: "chromium", device: "Desktop Chrome" },
  { name: "firefox", device: "Desktop Firefox" },
  { name: "webkit", device: "Desktop Safari" },
];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:43871/wet-explorer/",
    trace: "retain-on-failure",
  },
  projects: [
    ...engines.flatMap((engine) => [
      {
        name: engine.name,
        testIgnore: /(?:stream-performance|visual)\.spec\.ts/,
        use: { ...devices[engine.device] },
      },
      {
        name: `${engine.name}-performance`,
        testMatch: /stream-performance\.spec\.ts/,
        use: {
          ...devices[engine.device],
          trace: {
            mode: "retain-on-failure" as const,
            screenshots: false,
            snapshots: true,
            sources: true,
          },
          // Keep headless benchmark scheduling at 60 Hz; functional projects use browser defaults.
          launchOptions:
            engine.name === "firefox"
              ? { firefoxUserPrefs: { "layout.frame_rate": 60 } }
              : {},
        },
      },
    ]),
    {
      name: "chromium-visual",
      testMatch: /visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `"${process.execPath}" scripts/serve-dist.ts`,
    url: "http://127.0.0.1:43871/wet-explorer/",
    reuseExistingServer: !process.env.CI,
  },
});
