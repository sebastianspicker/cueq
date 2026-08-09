import { expect, test } from '@playwright/test';
import {
  authenticateAndOpen,
  changeToken,
  employeeToken,
  mockToken,
} from './phase2-acceptance-test-support.js';

test.describe('Phase 2 web acceptance (Playwright)', () => {
  test('reports page loads summaries for HR and blocks employee on restricted report', async ({
    page,
  }) => {
    const hrToken = mockToken({
      sub: 'c000000000000000000000103',
      email: 'hr@cueq.local',
      role: 'HR',
      organizationUnitId: 'c000000000000000000000001',
    });

    await authenticateAndOpen(page, 'en', hrToken, 'Reports');
    await page.getByLabel('From', { exact: true }).fill('2026-03-01');
    await page.getByLabel('To', { exact: true }).fill('2026-03-31');
    await page.getByRole('button', { name: 'Load reports' }).click();

    await expect(page.getByRole('heading', { name: 'Audit Summary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compliance Summary' })).toBeVisible();

    await changeToken(page, 'en', employeeToken);
    await page.getByRole('button', { name: 'Load reports' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('403');
    await expect(page.getByRole('heading', { name: 'Audit Summary' })).toHaveCount(0);
  });

  test('bookings page lists bookings and creates correction workflow', async ({ page }) => {
    await authenticateAndOpen(page, 'de', employeeToken, 'Buchungen');
    await page.getByRole('button', { name: 'Eigene Buchungen laden' }).click();

    const firstBookingIdCell = page.locator('tbody tr').first().locator('td').first();
    await expect(firstBookingIdCell).toBeVisible();
    const bookingId = (await firstBookingIdCell.textContent())?.trim();
    expect(bookingId).toBeTruthy();

    await page.getByLabel('Buchungs-ID').fill(bookingId ?? '');
    await page
      .getByLabel('Begründung')
      .fill('Need correction for this entry from acceptance test path.');
    await page.getByRole('button', { name: 'Korrektur-Workflow erstellen' }).click();
    await expect(page.getByText('Korrektur-Workflow erstellt.')).toBeVisible();
  });
});
