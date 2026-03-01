import { expect, test } from '@playwright/test';

const employeeToken =
  'mock.eyJzdWIiOiJjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMTAwIiwiZW1haWwiOiJlbXBsb3llZUBjdWVxLmxvY2FsIiwicm9sZSI6IkVNUExPWUVFIiwib3JnYW5pemF0aW9uVW5pdElkIjoiYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSJ9';

function mockToken(payload: Record<string, unknown>) {
  return `mock.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

test.describe('Phase 2 web acceptance (Playwright)', () => {
  test('serves default German dashboard and English locale route', async ({ request }) => {
    const de = await request.get('http://localhost:3000/de/dashboard');
    const en = await request.get('http://localhost:3000/en/dashboard');
    const closing = await request.get('http://localhost:3000/de/closing');
    const approvals = await request.get('http://localhost:3000/de/approvals');
    const reports = await request.get('http://localhost:3000/de/reports');
    const policyAdmin = await request.get('http://localhost:3000/de/policy-admin');
    const timeEngineDe = await request.get('http://localhost:3000/de/time-engine');
    const timeEngineEn = await request.get('http://localhost:3000/en/time-engine');

    expect(de.status()).toBe(200);
    expect(en.status()).toBe(200);
    expect(closing.status()).toBe(200);
    expect(approvals.status()).toBe(200);
    expect(reports.status()).toBe(200);
    expect(policyAdmin.status()).toBe(200);
    expect(timeEngineDe.status()).toBe(200);
    expect(timeEngineEn.status()).toBe(200);

    expect(await de.text()).toContain('Soll/Ist');
    expect(await en.text()).toContain('Target/actual');
    expect(await closing.text()).toContain('Monatsabschluss');
    expect(await approvals.text()).toContain('Freigabe-Postfach');
    expect(await reports.text()).toContain('Berichte');
    expect(await policyAdmin.text()).toContain('Policy-Administration');
    expect(await timeEngineDe.text()).toContain('Time-Engine-Evaluator');
    expect(await timeEngineEn.text()).toContain('Time Engine Evaluator');
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

  test('dashboard supports load + quick-action booking flow', async ({ page }) => {
    await page.goto('http://localhost:3000/de/dashboard');
    await page.getByLabel('Bearer-Token').fill(employeeToken);
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

    await page.goto('http://localhost:3000/de/roster');

    await page.getByLabel('Bearer-Token').fill(plannerToken);
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

  test('leave request flow and team-calendar role visibility', async ({ page }) => {
    const leadToken = mockToken({
      sub: 'c000000000000000000000101',
      email: 'lead@cueq.local',
      role: 'TEAM_LEAD',
      organizationUnitId: 'c000000000000000000000001',
    });

    await page.goto('http://localhost:3000/de/leave');
    await page.getByLabel('Bearer-Token').fill(employeeToken);
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

    await page.goto('http://localhost:3000/de/team-calendar');
    await page.getByLabel('Bearer-Token').fill(employeeToken);
    await page.getByLabel('Start').fill('2026-04-01');
    await page.getByLabel('Ende').fill('2026-04-30');
    await page.getByRole('button', { name: 'Kalender laden' }).click();
    await expect(page.getByText('REQUESTED')).toHaveCount(0);

    await page.getByLabel('Bearer-Token').fill(leadToken);
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

    await page.goto('http://localhost:3000/de/approvals');
    await page.getByLabel('Bearer-Token').fill(leadToken);
    await page.getByRole('button', { name: 'Postfach laden' }).click();

    await expect(page.getByRole('heading', { name: 'Postfach', exact: true })).toBeVisible();
    const bookingCorrectionItem = page
      .getByRole('listitem')
      .filter({ hasText: 'BOOKING_CORRECTION' })
      .first();
    await expect(bookingCorrectionItem).toBeVisible();
    await expect(bookingCorrectionItem.getByText('Überfällig: Nein')).toBeVisible();

    await bookingCorrectionItem.getByRole('button', { name: 'Details' }).click();
    const detailsArticle = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Details', exact: true }) });
    await detailsArticle.getByRole('combobox').first().selectOption('DELEGATE');
    await page.getByLabel('Delegieren an Person-ID').fill('c000000000000000000000103');
    await page.getByLabel('Aktionsbegründung').fill('Playwright delegation');
    await page.getByRole('button', { name: 'Aktion ausführen' }).click();
    await expect(page.getByText('Workflow-Aktion ausgeführt.')).toBeVisible();

    await page.getByLabel('Bearer-Token').fill(hrToken);
    await page.getByRole('button', { name: 'Postfach laden' }).click();
    await expect(page.getByRole('list').getByText('BOOKING_CORRECTION')).toBeVisible();
  });

  test('reports page loads summaries for HR and blocks employee on restricted report', async ({
    page,
  }) => {
    const hrToken = mockToken({
      sub: 'c000000000000000000000103',
      email: 'hr@cueq.local',
      role: 'HR',
      organizationUnitId: 'c000000000000000000000001',
    });

    await page.goto('http://localhost:3000/en/reports');
    await page.getByLabel('Bearer token').fill(hrToken);
    await page.getByLabel('From', { exact: true }).fill('2026-03-01');
    await page.getByLabel('To', { exact: true }).fill('2026-03-31');
    await page.getByRole('button', { name: 'Load reports' }).click();

    await expect(page.getByRole('heading', { name: 'Audit Summary' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compliance Summary' })).toBeVisible();

    await page.getByLabel('Bearer token').fill(employeeToken);
    await page.getByRole('button', { name: 'Load reports' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('403');
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

    await page.goto('http://localhost:3000/de/policy-admin');

    await page.getByLabel('Bearer-Token').fill(hrToken);
    await page.getByRole('button', { name: 'Bundle laden' }).click();
    await expect(page.getByText('Policy-Bundle geladen.')).toBeVisible();

    await page.getByLabel('Bearer-Token').fill(adminToken);
    await page.getByRole('button', { name: 'Historie laden' }).click();
    await expect(page.getByText('Policy-Historie geladen.')).toBeVisible();

    await page.getByLabel('Bearer-Token').fill(employeeToken);
    await page.getByRole('button', { name: 'Bundle laden' }).click();
    await expect(page.locator('p[role="alert"]')).toContainText('403');
  });
});
