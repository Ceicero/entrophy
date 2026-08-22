import { test, expect } from '@playwright/test';

/**
 * Requires the API running locally with `E2E_TEST_MODE=true`. Skipped automatically when
 * `E2E_API_URL` is not set. Uses the seeded demo guild id `000000000000000000` (see
 * packages/database/prisma/seed.ts) that `/auth/test-login` grants the synthetic user admin on.
 */
const E2E_API_URL = process.env.E2E_API_URL;
const DEMO_GUILD_ID = '000000000000000000';

test.describe('plugin config + audit trail', () => {
  test.skip(!E2E_API_URL, 'E2E_API_URL not set — skipping tests that require a running API');

  test('toggling a plugin records an audit log entry', async ({ page, request }) => {
    const loginResponse = await request.post(`${E2E_API_URL}/auth/test-login`);
    expect(loginResponse.ok()).toBeTruthy();

    await page.goto(`/dashboard/${DEMO_GUILD_ID}/plugins`);
    await expect(page.getByRole('heading', { name: 'Plugins' })).toBeVisible();

    const pluginCard = page.locator('[role="switch"]').first();
    await expect(pluginCard).toBeVisible();
    const wasChecked = (await pluginCard.getAttribute('aria-checked')) === 'true';
    await pluginCard.click();
    await expect(pluginCard).toHaveAttribute('aria-checked', wasChecked ? 'false' : 'true');

    await page.goto(`/dashboard/${DEMO_GUILD_ID}/audit`);
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await expect(page.getByText(/plugin (enable|disable)/i).first()).toBeVisible();
  });
});
