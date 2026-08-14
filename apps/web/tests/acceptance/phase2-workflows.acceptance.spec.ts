import { expect, test } from '@playwright/test';
import { authenticateAndOpen, employeeToken, mockToken } from './phase2-acceptance-test-support.js';

test.describe('Phase 2 web acceptance (Playwright)', () => {
  test('time-engine evaluator submits the default payload through the browser flow', async ({
    page,
  }) => {
    const evaluatorToken = mockToken({
      sub: 'c000000000000000000000103',
      email: 'hr@cueq.local',
      role: 'HR',
      organizationUnitId: 'c000000000000000000000001',
    });

    await authenticateAndOpen(page, 'de', evaluatorToken, 'Time Engine');
    await page.getByRole('button', { name: 'Auswerten' }).click();

    await expect(page.getByText('Ist-Stunden')).toBeVisible();
    await expect(page.getByText('Delta-Stunden')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Zuschlagsminuten' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'WEEKEND' })).toBeVisible();
  });

  test('dashboard supports load + quick-action booking flow', async ({ page }) => {
    await authenticateAndOpen(page, 'de', employeeToken, 'Heute');
    await page.getByRole('button', { name: 'Dashboard laden' }).click();

    await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
    await page.getByRole('button', { name: 'Kommen' }).click();
    await expect(page.getByText('Buchung erfolgreich angelegt.')).toBeVisible();
  });

  test('roster page supports create + assign + publish planner flow', async ({ page }) => {
    const plannerToken = mockToken({
      sub: 'c000000000000000000000102',
      email: 'planner@cueq.local',
      role: 'SHIFT_PLANNER',
      organizationUnitId: 'c000000000000000000000002',
    });

    await authenticateAndOpen(page, 'de', plannerToken, 'Dienstplan');
    await page.getByLabel('Organisationseinheit-ID').fill('c000000000000000000000002');
    await page.getByLabel('Zeitraum-Start').fill('2026-04-02T10:00');
    await page.getByLabel('Zeitraum-Ende').fill('2026-04-30T20:00');

    await page.getByRole('button', { name: 'Entwurf erstellen' }).first().click();
    await expect(page.getByText('Dienstplan-Entwurf erstellt.')).toBeVisible();

    await page.getByLabel('Start', { exact: true }).fill('2026-04-05T08:00');
    await page.getByLabel('Ende', { exact: true }).fill('2026-04-05T16:00');
    await page.getByRole('button', { name: 'Erstellen', exact: true }).click();
    await expect(page.getByText('Schicht erstellt.')).toBeVisible();

    await page.getByRole('button', { name: 'Zuweisen' }).first().click();
    await expect(page.getByText('Zuweisung erstellt.')).toBeVisible();

    await page.getByRole('button', { name: 'Dienstplan veröffentlichen' }).click();
    await expect(page.getByText('Dienstplan veröffentlicht.')).toBeVisible();

    await expect(page.getByRole('heading', { name: 'Plan-Ist-Abgleich' })).toBeVisible();
  });
});
