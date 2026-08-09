import { expect, test } from '@playwright/test';
import { employeeToken } from './phase2-acceptance-test-support.js';

test.describe('Phase 2 web acceptance (Playwright)', () => {
  test('locale switch preserves the current route', async ({ page }) => {
    await page.goto('http://localhost:3000/en/settings');
    await page.getByRole('link', { name: 'DE' }).click();
    await expect(page).toHaveURL(/\/de\/settings$/u);
  });

  test('serves authenticated API identity endpoint', async ({ request }) => {
    const response = await request.get('http://localhost:3001/v1/me', {
      headers: {
        Authorization: `Bearer ${employeeToken}`,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.role).toBe('EMPLOYEE');
  });
});
