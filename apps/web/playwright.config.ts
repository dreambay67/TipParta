import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3210",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:3210"
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }
    },
    {
      name: "mobil",
      use: { ...devices["Pixel 7"] }
    }
  ]
});
