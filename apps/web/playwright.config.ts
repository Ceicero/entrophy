import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the public website's smoke tests (ARCHITECTURE.md §17). Unlike the dashboard suite,
 * these tests need no API and no auth — the site is public, and pages that call the API (donate) are written to
 * degrade gracefully when it's unreachable, which is itself one of the things this suite verifies. `webServer`
 * boots the site with `next dev` against whatever `NEXT_PUBLIC_API_URL` is in the environment (default
 * `http://localhost:3001`, which nothing is listening on during a plain local/CI run — exactly the "API is
 * down" case the /donate test exercises).
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3003',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3003',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
