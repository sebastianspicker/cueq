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

async function setTokenIfPresent(page: Page, token: string) {
  const tokenField = page.locator('input[type="password"]').first();
  if ((await tokenField.count()) > 0) {
    await tokenField.fill(token);
  }
}

async function captureRouteScreenshot(
  page: Page,
  options: { route: string; token: string; fileName: string },
) {
  await page.goto(options.route, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toBeVisible();
  await setTokenIfPresent(page, options.token);
  // Let transitions and hydration settle before capture.
  await page.waitForTimeout(350);
  await page.screenshot({
    path: join(OUTPUT_DIR, options.fileName),
    fullPage: true,
  });
}

test.describe('Mock University NRW demo screenshots', () => {
  test.beforeAll(async () => {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
    await mkdir(OUTPUT_DIR, { recursive: true });
  });

  test('captures six deterministic German demo screenshots', async ({ page }) => {
    await captureRouteScreenshot(page, {
      route: '/de/dashboard',
      token: TOKENS.employee,
      fileName: FILES.dashboard,
    });

    await captureRouteScreenshot(page, {
      route: '/de/leave',
      token: TOKENS.employee,
      fileName: FILES.leave,
    });

    await captureRouteScreenshot(page, {
      route: '/de/roster',
      token: TOKENS.planner,
      fileName: FILES.roster,
    });

    await captureRouteScreenshot(page, {
      route: '/de/approvals',
      token: TOKENS.lead,
      fileName: FILES.approvals,
    });

    await captureRouteScreenshot(page, {
      route: '/de/closing',
      token: TOKENS.hr,
      fileName: FILES.closing,
    });

    await captureRouteScreenshot(page, {
      route: '/de/reports',
      token: TOKENS.hr,
      fileName: FILES.reports,
    });
  });
});
