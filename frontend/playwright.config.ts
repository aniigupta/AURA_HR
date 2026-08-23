import { defineConfig, devices } from "@playwright/test";

// Runs against an already-running frontend + backend (see e2e/README.md) —
// this project doesn't have a single-command way to stand up the full stack
// (Postgres, backend, frontend) the way the unit tests can fake with SQLite,
// so webServer auto-start isn't wired up here. Point PLAYWRIGHT_BASE_URL at
// whatever's running.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3010",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          // Fake camera device so selfie capture (getUserMedia) works
          // headlessly without a real webcam.
          args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
        },
      },
    },
  ],
});
