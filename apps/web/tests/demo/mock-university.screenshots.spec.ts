import { expect, test, type Page } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const OUTPUT_DIR = join(process.cwd(), 'test-results', 'demo-screenshots', 'latest');
const FILES = {
  dashboard: '01-dashboard.png',
  leave: '02-leave.png',
  roster: '03-roster.png',
  approvals: '04-approvals.png',
  closing: '05-closing.png',
  reports: '06-reports.png',
};

const IDS = {
  ouAdmin: 'c000000000000000000000001',
  ouSecurity: 'c000000000000000000000002',
  employee: 'c000000000000000000000100',
  lead: 'c000000000000000000000101',
  planner: 'c000000000000000000000102',
  hr: 'c000000000000000000000103',
};

function mockToken(payload: Record<string, unknown>) {
  return `mock.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

const TOKENS = {
  employee: mockToken({
    sub: IDS.employee,
    email: 'employee@cueq.local',
    role: 'EMPLOYEE',
    organizationUnitId: IDS.ouAdmin,
  }),
  lead: mockToken({
    sub: IDS.lead,
    email: 'lead@cueq.local',
    role: 'TEAM_LEAD',
    organizationUnitId: IDS.ouAdmin,
  }),
  planner: mockToken({
    sub: IDS.planner,
    email: 'planner@cueq.local',
    role: 'SHIFT_PLANNER',
    organizationUnitId: IDS.ouSecurity,
  }),
  hr: mockToken({
    sub: IDS.hr,
    email: 'hr@cueq.local',
    role: 'HR',
    organizationUnitId: IDS.ouAdmin,
  }),
};

async function setToken(page: Page, token: string) {
  const tokenField = page.getByLabel(/Bearer-Token|Bearer token/u).first();
  await tokenField.fill(token);
}

test.describe('Mock University NRW demo screenshots', () => {
  test.beforeAll(async () => {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
    await mkdir(OUTPUT_DIR, { recursive: true });
  });

  test('captures six deterministic German demo screenshots', async ({ page }) => {
    await page.goto('/de/dashboard');
    await setToken(page, TOKENS.employee);
    await page.getByRole('button', { name: 'Dashboard laden' }).click();
    await expect(page.getByRole('heading', { name: 'Übersicht' })).toBeVisible();
    await page.screenshot({
      path: join(OUTPUT_DIR, FILES.dashboard),
      fullPage: true,
    });

    await page.goto('/de/leave');
    await setToken(page, TOKENS.employee);
    await page.getByRole('button', { name: 'Kontostand laden' }).click();
    await page.getByRole('button', { name: 'Eigene Abwesenheiten laden' }).click();
    await expect(page.getByRole('heading', { name: 'Urlaubskonto' })).toBeVisible();
    await page.screenshot({
      path: join(OUTPUT_DIR, FILES.leave),
      fullPage: true,
    });

    await page.goto('/de/roster');
    await setToken(page, TOKENS.planner);
    await page.getByRole('button', { name: 'Aktuellen Dienstplan laden' }).click();
    await expect(page.getByRole('heading', { name: 'Plan-Ist-Abgleich' })).toBeVisible();
    await page.screenshot({
      path: join(OUTPUT_DIR, FILES.roster),
      fullPage: true,
    });

    await page.goto('/de/approvals');
    await setToken(page, TOKENS.lead);
    await page.getByRole('button', { name: 'Postfach laden' }).click();
    const workflowItem = page
      .getByRole('listitem')
      .filter({ hasText: 'BOOKING_CORRECTION' })
      .first();
    await expect(workflowItem).toBeVisible();
    await workflowItem.getByRole('button', { name: 'Details' }).click();
    await expect(page.getByRole('heading', { name: 'Details', exact: true })).toBeVisible();
    await page.screenshot({
      path: join(OUTPUT_DIR, FILES.approvals),
      fullPage: true,
    });

    await page.goto('/de/closing');
    await setToken(page, TOKENS.hr);
    await page.getByRole('button', { name: 'Zeiträume laden' }).click();
    await expect(page.getByRole('heading', { name: 'Abschlusszeiträume' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Checkliste' })).toBeVisible();
    await page.screenshot({
      path: join(OUTPUT_DIR, FILES.closing),
      fullPage: true,
    });

    await page.goto('/de/reports');
    await setToken(page, TOKENS.hr);
    await page.getByLabel('Von').fill('2026-03-01');
    await page.getByLabel('Bis').fill('2026-03-31');
    await page.getByLabel('Organisationseinheit-ID (optional)').fill(IDS.ouSecurity);
    await page.getByRole('button', { name: 'Berichte laden' }).click();
    await expect(page.getByRole('heading', { name: 'Team-Abwesenheit' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compliance-Zusammenfassung' })).toBeVisible();
    await page.screenshot({
      path: join(OUTPUT_DIR, FILES.reports),
      fullPage: true,
    });
  });
});
