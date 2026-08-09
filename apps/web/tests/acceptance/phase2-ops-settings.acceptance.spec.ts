import { expect, test } from '@playwright/test';
import {
  authenticateAndOpen,
  changeToken,
  employeeToken,
  mockToken,
} from './phase2-acceptance-test-support.js';

test.describe('Phase 2 web acceptance (Playwright)', () => {
  test('on-call page supports deployment and compliance checks', async ({ page }) => {
    const hrToken = mockToken({
      sub: 'c000000000000000000000103',
      email: 'hr@cueq.local',
      role: 'HR',
      organizationUnitId: 'c000000000000000000000001',
    });

    await authenticateAndOpen(page, 'de', hrToken, 'Rufbereitschaft');
    await page.getByLabel('Person-ID').fill('c000000000000000000000105');
    await page.getByLabel('Organisationseinheit-ID').fill('c000000000000000000000002');
    await page.getByRole('button', { name: 'Rotationen laden' }).click();
    await page.getByRole('button', { name: 'Einsätze laden' }).click();
    await page.getByRole('button', { name: 'Compliance prüfen' }).click();
    await expect(page.getByRole('heading', { name: 'Compliance' })).toBeVisible();
  });

  test('policy admin page allows HR/Admin and blocks employee', async ({ page }) => {
    const hrToken = mockToken({
      sub: 'c000000000000000000000103',
      email: 'hr@cueq.local',
      role: 'HR',
      organizationUnitId: 'c000000000000000000000001',
    });
    const adminToken = mockToken({
      sub: 'c000000000000000000000104',
      email: 'admin@cueq.local',
      role: 'ADMIN',
      organizationUnitId: 'c000000000000000000000001',
    });

    await authenticateAndOpen(page, 'de', hrToken, 'Policy-Admin');
    await page.getByRole('button', { name: 'Bundle laden' }).click();
    await expect(page.getByText('Policy-Bundle geladen.')).toBeVisible();

    await changeToken(page, 'de', adminToken);
    await page.getByRole('button', { name: 'Historie laden' }).click();
    await expect(page.getByText('Policy-Historie geladen.')).toBeVisible();

    await changeToken(page, 'de', employeeToken);
    await page.getByRole('button', { name: 'Bundle laden' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('403');
    await expect(page.getByText('Policy-Bundle geladen.')).toHaveCount(0);
  });

  test('audit page loads aggregate summary and settings persist locale-safe preferences', async ({
    page,
  }) => {
    const hrToken = mockToken({
      sub: 'c000000000000000000000103',
      email: 'hr@cueq.local',
      role: 'HR',
      organizationUnitId: 'c000000000000000000000001',
    });

    await page.goto('http://localhost:3000/en/settings');
    await page.getByLabel('API base URL').fill('/api');
    await page.getByLabel('Bearer token').fill(hrToken);
    await page.getByLabel('Theme').selectOption('dark');
    await page.getByLabel('Default page size').selectOption('10');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible();

    await page.getByRole('link', { name: 'Audit Log', exact: true }).click();
    await page.getByRole('button', { name: 'Load audit summary' }).click();
    await expect(page.getByRole('heading', { name: 'Activity overview' })).toBeVisible();
  });
});
