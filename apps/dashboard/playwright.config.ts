import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the dashboard's end-to-end tests. Tests self-skip (see e2e/*.spec.ts)
 * when `E2E_API_URL` is not set, so `pnpm test:e2e` never fails on a machine without the API
 * running with `E2E_TEST_MODE=true`.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
