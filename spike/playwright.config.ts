import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright",
  testMatch: "**/*.pw.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "../.frames/dist/playwright-results",
  use: {
    headless: true,
    launchOptions: {
      executablePath:
        process.env.FRAMES_BROWSER ??
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      args: [
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-extensions",
        "--disable-sync",
      ],
    },
  },
});
