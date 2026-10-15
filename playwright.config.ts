import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright scaffold (see node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md).
 *
 * The Next.js guide recommends testing against production code, so the
 * webServer runs `npm run build && npm run start`. The app's only page (`/`)
 * is static and the database layer is lazy, so a production build works
 * without a database or Mailjet account. Set E2E_BASE_URL to point the suite
 * at an already-running server instead (the local webServer is then skipped).
 *
 * Chromium only — the scaffold does not need cross-browser coverage.
 *
 * The dev machine may already serve other apps on the default port (3000 is
 * often taken), so the suite defaults to 3100 and only reuses a server on that
 * port. Override E2E_PORT or point E2E_BASE_URL at an existing deployment.
 */
const port = process.env.E2E_PORT ?? "3100";
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run start -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        // A cold `next build` can take a couple of minutes on first run.
        timeout: 300_000,
      },
});
