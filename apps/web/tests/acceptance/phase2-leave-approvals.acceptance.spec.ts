import { expect, test } from '@playwright/test';
import {
  authenticateAndOpen,
  changeToken,
  employeeToken,
  mockToken,
} from './phase2-acceptance-test-support.js';

test.describe('Phase 2 web acceptance (Playwright)', () => {
  test('leave request flow and team-calendar role visibility', async ({ page }) => {
    const leadToken = mockToken({
      sub: 'c000000000000000000000101',
      email: 'lead@cueq.local',
      role: 'TEAM_LEAD',
      organizationUnitId: 'c000000000000000000000001',
    });

    await authenticateAndOpen(page, 'de', employeeToken, 'Abwesenheiten');
    await page.getByLabel('Jahr').fill('2026');
    await page.getByLabel('Stand-Datum').fill('2026-12-31');
    await page.getByRole('button', { name: 'Kontostand laden' }).click();
    await expect(page.getByRole('heading', { name: 'Urlaubskonto' })).toBeVisible();

    await page.getByLabel('Typ').selectOption('ANNUAL_LEAVE');
    await page.getByLabel('Startdatum').fill('2026-04-20');
    await page.getByLabel('Enddatum').fill('2026-04-22');
    await page.getByLabel('Notiz').fill('Playwright leave request');
    await page.getByRole('button', { name: 'Abwesenheit beantragen' }).last().click();
    await expect(page.getByText('Abwesenheit erfasst.')).toBeVisible();

    await page.getByRole('link', { name: 'Team-Kalender', exact: true }).click();
    await page.getByLabel('Start').fill('2026-04-01');
    await page.getByLabel('Ende', { exact: true }).fill('2026-04-30');
    await page.getByRole('button', { name: 'Kalender laden' }).click();
    await expect(page.getByText('REQUESTED')).toHaveCount(0);

    await changeToken(page, 'de', leadToken);
    await page.getByRole('button', { name: 'Kalender laden' }).click();
    await expect(page.getByText('REQUESTED')).toBeVisible();
  });

  test('approvals inbox supports delegation and overdue indicator rendering', async ({ page }) => {
    const leadToken = mockToken({
      sub: 'c000000000000000000000101',
      email: 'lead@cueq.local',
      role: 'TEAM_LEAD',
      organizationUnitId: 'c000000000000000000000001',
    });
    const hrToken = mockToken({
      sub: 'c000000000000000000000103',
      email: 'hr@cueq.local',
      role: 'HR',
      organizationUnitId: 'c000000000000000000000001',
    });

    await authenticateAndOpen(page, 'de', leadToken, 'Freigaben');
    await page.getByRole('button', { name: 'Postfach laden' }).click();

    await expect(page.getByRole('heading', { name: 'Postfach', exact: true })).toBeVisible();
    const bookingCorrectionItem = page
      .getByRole('listitem')
      .filter({ hasText: 'BOOKING_CORRECTION' })
      .first();
    await expect(bookingCorrectionItem).toBeVisible();

    await bookingCorrectionItem.getByRole('button', { name: 'Details' }).click();
    const detailsArticle = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Details', exact: true }) });
    await detailsArticle.getByRole('combobox').first().selectOption('DELEGATE');
    await page.getByLabel('Delegieren an Person-ID').fill('c000000000000000000000103');
    await page.getByLabel('Aktionsbegründung').fill('Playwright delegation');
    await page.getByRole('button', { name: 'Delegieren' }).click();
    await expect(page.getByText('Workflow-Aktion ausgeführt.')).toBeVisible();

    await changeToken(page, 'de', hrToken);
    await page.getByRole('button', { name: 'Postfach laden' }).click();
    await expect(page.getByRole('list').getByText('BOOKING_CORRECTION')).toBeVisible();
  });
});
