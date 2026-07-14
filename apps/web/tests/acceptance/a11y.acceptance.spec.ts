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

async function authenticateAndNavigate(page: Page, targetName: string) {
  await page.goto('http://localhost:3000/de/settings');
  await page.getByLabel('Token').fill(hrToken);
  await page.getByRole('link', { name: targetName, exact: true }).click();
  await expect(page.locator('.cq-session-state')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByText('Personalstelle', { exact: true }).first()).toBeVisible();
}

async function expectNoCriticalOrSeriousViolations(page: Page, targetName: string) {
  await authenticateAndNavigate(page, targetName);

  const analysis = await new AxeBuilder({ page }).analyze();
  const blocking = analysis.violations.filter(
    (violation: { impact?: string | null }) =>
      violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(blocking).toEqual([]);
}

test.describe('a11y acceptance (critical/serious)', () => {
  test('dashboard route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Dashboard');
  });

  test('approvals route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Freigaben');
  });

  test('closing route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Monatsabschluss');
  });

  test('reports route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Berichte');
  });

  test('audit route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Audit-Protokoll');
  });

  test('settings route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Einstellungen');
  });

  test('bookings route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Meine Buchungen');
  });

  test('oncall route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Rufbereitschaft');
  });

  test('policy admin route', async ({ page }) => {
    await expectNoCriticalOrSeriousViolations(page, 'Policy-Admin');
  });
});
