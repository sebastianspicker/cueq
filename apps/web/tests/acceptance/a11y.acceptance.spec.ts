import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function mockToken(payload: Record<string, unknown>) {
  return `mock.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

const hrToken = mockToken({
  sub: 'c000000000000000000000103',
  email: 'hr@cueq.local',
  role: 'HR',
  organizationUnitId: 'c000000000000000000000001',
});

async function expectNoCriticalOrSeriousViolations(page: Page, url: string, token?: string) {
  await page.goto(url);

  if (token) {
    const tokenField = page.getByLabel(/Bearer-Token|Bearer token/u).first();
    if (await tokenField.count()) {
      await tokenField.fill(token);
    }
  }

  const analysis = await new AxeBuilder({ page }).analyze();
  const blocking = analysis.violations.filter(
    (violation: { impact?: string | null }) =>
      violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(blocking).toEqual([]);
}

test.describe('a11y acceptance (critical/serious)', () => {
  test('dashboard route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'http://localhost:3000/de/dashboard', hrToken);
  });

  test('approvals route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'http://localhost:3000/de/approvals', hrToken);
  });

  test('closing route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'http://localhost:3000/de/closing', hrToken);
  });

  test('reports route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'http://localhost:3000/de/reports', hrToken);
  });

  test('audit route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'http://localhost:3000/de/audit', hrToken);
  });

  test('settings route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'http://localhost:3000/de/settings', hrToken);
  });

  test('bookings route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'http://localhost:3000/de/bookings', hrToken);
  });

  test('oncall route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'http://localhost:3000/de/oncall', hrToken);
  });

  test('policy admin route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(
      page,
      'http://localhost:3000/de/policy-admin',
      hrToken,
    );
  });
});
