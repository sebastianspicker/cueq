import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DEMO_TOKENS, installMockUniversityFixtureBrowser } from './mock-university.api-fixtures';

const DATA_SOURCE = process.env.CUEQ_DEMO_SCREENSHOT_DATA_SOURCE ?? 'fixture';
if (DATA_SOURCE !== 'fixture' && DATA_SOURCE !== 'database') {
  throw new Error(`Unexpected demo screenshot data source: ${DATA_SOURCE}`);
}

const OUTPUT_DIR = join(
  process.cwd(),
  'test-results',
  'demo-screenshots',
  DATA_SOURCE === 'fixture' ? 'latest' : 'database',
);
const FILES = {
  dashboard: '01-dashboard.png',
  leave: '02-leave.png',
  roster: '03-roster.png',
  approvals: '04-approvals.png',
  closing: '05-closing.png',
  reports: '06-reports.png',
};

interface Diagnostics {
  consoleErrors: string[];
  pageErrors: string[];
}

function attachDiagnostics(page: Page): Diagnostics {
  const diagnostics: Diagnostics = { consoleErrors: [], pageErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  return diagnostics;
}

function resetDiagnostics(diagnostics: Diagnostics) {
  diagnostics.consoleErrors.length = 0;
  diagnostics.pageErrors.length = 0;
}

async function expectNoBlockingAccessibilityViolations(page: Page) {
  const analysis = await new AxeBuilder({ page }).analyze();
  const blocking = analysis.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        html: node.html,
        failureSummary: node.failureSummary,
      })),
    }));
  expect(blocking).toEqual([]);
}

async function loadDashboard(page: Page) {
  await page.getByRole('button', { name: 'Dashboard laden' }).click();
  await expect(page.getByText('Mock University NRW - Flextime Full-time').first()).toBeVisible();
}

async function loadLeave(page: Page) {
  await page.getByRole('button', { name: 'Kontostand laden' }).click();
  await expect(page.getByRole('heading', { name: 'Urlaubskonto' })).toBeVisible();
  await page.getByRole('button', { name: 'Eigene Abwesenheiten laden' }).click();
  const absencesSection = page.getByRole('heading', { name: 'Meine Abwesenheiten' }).locator('..');
  await expect(absencesSection.getByText('Sonderurlaub', { exact: true })).toBeVisible();
  await expect(absencesSection.getByText('Fortbildung', { exact: true })).toBeVisible();
}

async function loadRoster(page: Page) {
  await page.getByRole('button', { name: 'Aktuellen Dienstplan laden' }).click();
  await expect(page.getByText('NIGHT', { exact: true })).toBeVisible();
  await expect(page.getByText('Nora Nachtwache', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan-Ist-Abgleich' })).toBeVisible();
}

async function loadApprovals(page: Page) {
  await page.getByRole('button', { name: 'Postfach laden' }).click();
  const inboxSection = page.getByRole('heading', { name: 'Postfach' }).locator('..');
  await expect(inboxSection.getByText('Urlaubsantrag', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Details' }).first().click();
  await expect(page.getByText('Urlaubsantrag im Demo-Postfach', { exact: true })).toBeVisible();
}

async function loadClosing(page: Page) {
  await page.getByRole('button', { name: 'Zeiträume laden' }).click();
  if (DATA_SOURCE === 'fixture') {
    await expect(page.getByText('Zeitkonten vollständig', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'Checkliste' })).toBeVisible();
  }
  await expect(page.getByText('demo-csv-v1-2026-03-mock-university')).toBeVisible();
}

async function loadReports(page: Page) {
  await page.getByRole('button', { name: 'Berichte laden' }).click();
  await expect(page.getByRole('heading', { name: 'Team-Abwesenheit' })).toBeVisible();
  if (DATA_SOURCE === 'fixture') {
    await expect(page.getByText(/4 Anträge.*7 Abwesenheitstage/)).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Compliance-Zusammenfassung' })).toBeVisible();
}

async function captureRouteScreenshot(
  page: Page,
  diagnostics: Diagnostics,
  options: {
    route: string;
    targetName: string;
    roleName: string;
    token: string;
    fileName: string;
    load: (page: Page) => Promise<void>;
  },
) {
  resetDiagnostics(diagnostics);
  await page.goto('/de/settings', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Token').fill(options.token);
  await expect(page.locator('.cq-session-state')).toHaveAttribute('data-phase', 'ready');
  await expect(
    page.locator('.cq-session-panel').getByText(options.roleName, { exact: true }),
  ).toBeVisible();
  resetDiagnostics(diagnostics);

  const targetLink = page.getByRole('link', {
    name: options.targetName,
    exact: true,
    includeHidden: true,
  });
  if (!(await targetLink.isVisible())) {
    const targetGroup = page.locator('.cq-nav-block').filter({ has: targetLink });
    await targetGroup.locator('summary').click();
  }
  await targetLink.click();
  await expect(page).toHaveURL(new RegExp(`/de/${options.route}$`));
  await expect(page).toHaveTitle(/cueq/i);
  await expect(page.locator('main')).toBeVisible();
  await options.load(page);

  const alertMessages = (await page.getByRole('alert').allTextContents())
    .map((message) => message.trim())
    .filter(Boolean);
  expect(alertMessages).toEqual([]);
  await expect(page.locator('[data-nextjs-dialog-overlay], nextjs-portal')).toHaveCount(0);
  await page.evaluate(async () => document.fonts.ready);
  await page.addStyleTag({
    content:
      '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
  });
  await expectNoBlockingAccessibilityViolations(page);
  expect(diagnostics.consoleErrors).toEqual([]);
  expect(diagnostics.pageErrors).toEqual([]);

  await page.screenshot({
    path: join(OUTPUT_DIR, options.fileName),
    fullPage: true,
    animations: 'disabled',
  });
}

test.describe(`Mock University NRW demo screenshots (${DATA_SOURCE})`, () => {
  test.beforeAll(async () => {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
    await mkdir(OUTPUT_DIR, { recursive: true });
  });

  test('captures six loaded German demo screens', async ({ page }) => {
    const unexpectedRequests: string[] = [];
    if (DATA_SOURCE === 'fixture') {
      await installMockUniversityFixtureBrowser(page, unexpectedRequests);
    }
    const diagnostics = attachDiagnostics(page);

    await captureRouteScreenshot(page, diagnostics, {
      route: 'dashboard',
      targetName: 'Heute',
      roleName: 'Mitarbeitende',
      token: DEMO_TOKENS.employee,
      fileName: FILES.dashboard,
      load: loadDashboard,
    });

    await captureRouteScreenshot(page, diagnostics, {
      route: 'leave',
      targetName: 'Abwesenheiten',
      roleName: 'Mitarbeitende',
      token: DEMO_TOKENS.employee,
      fileName: FILES.leave,
      load: loadLeave,
    });

    await captureRouteScreenshot(page, diagnostics, {
      route: 'roster',
      targetName: 'Dienstplan',
      roleName: 'Dienstplanung',
      token: DEMO_TOKENS.planner,
      fileName: FILES.roster,
      load: loadRoster,
    });

    await captureRouteScreenshot(page, diagnostics, {
      route: 'approvals',
      targetName: 'Freigaben',
      roleName: 'Teamleitung',
      token: DEMO_TOKENS.lead,
      fileName: FILES.approvals,
      load: loadApprovals,
    });

    await captureRouteScreenshot(page, diagnostics, {
      route: 'closing',
      targetName: 'Monatsabschluss',
      roleName: 'Personalstelle',
      token: DEMO_TOKENS.hr,
      fileName: FILES.closing,
      load: loadClosing,
    });

    await captureRouteScreenshot(page, diagnostics, {
      route: 'reports',
      targetName: 'Berichte',
      roleName: 'Personalstelle',
      token: DEMO_TOKENS.hr,
      fileName: FILES.reports,
      load: loadReports,
    });

    expect(unexpectedRequests).toEqual([]);
  });

  test('captures the redesigned employee dashboard at the desktop viewport', async ({ page }) => {
    const unexpectedRequests: string[] = [];
    if (DATA_SOURCE === 'fixture') {
      await installMockUniversityFixtureBrowser(page, unexpectedRequests);
    }
    const diagnostics = attachDiagnostics(page);

    await captureRouteScreenshot(page, diagnostics, {
      route: 'dashboard',
      targetName: 'Heute',
      roleName: 'Mitarbeitende',
      token: DEMO_TOKENS.employee,
      fileName: FILES.dashboard,
      load: loadDashboard,
    });

    expect(unexpectedRequests).toEqual([]);
  });

  test('captures the redesigned employee dashboard at the compact viewport', async ({ page }) => {
    const unexpectedRequests: string[] = [];
    if (DATA_SOURCE === 'fixture') {
      await installMockUniversityFixtureBrowser(page, unexpectedRequests);
    }
    const diagnostics = attachDiagnostics(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/de/settings', { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Token').fill(DEMO_TOKENS.employee);
    await expect(page.locator('.cq-session-state')).toHaveAttribute('data-phase', 'ready');
    resetDiagnostics(diagnostics);
    await page.locator('.cq-nav-toggle').click();
    await page.getByRole('link', { name: 'Heute', exact: true }).click();
    await loadDashboard(page);
    await page.evaluate(async () => document.fonts.ready);
    await page.addStyleTag({
      content:
        '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }',
    });
    await expectNoBlockingAccessibilityViolations(page);
    expect(diagnostics.consoleErrors).toEqual([]);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(unexpectedRequests).toEqual([]);

    const viewportMetrics = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(viewportMetrics.documentWidth).toBeLessThanOrEqual(viewportMetrics.viewportWidth);

    await page.screenshot({
      path: join(OUTPUT_DIR, '01-dashboard-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
  });

  test('keeps every public workflow usable at the compact viewport', async ({ page }) => {
    const unexpectedRequests: string[] = [];
    if (DATA_SOURCE === 'fixture') {
      await installMockUniversityFixtureBrowser(page, unexpectedRequests);
    }

    await page.setViewportSize({ width: 375, height: 812 });
    const workflows = [
      { targetName: 'Heute', token: DEMO_TOKENS.employee, load: loadDashboard },
      { targetName: 'Abwesenheiten', token: DEMO_TOKENS.employee, load: loadLeave },
      { targetName: 'Dienstplan', token: DEMO_TOKENS.planner, load: loadRoster },
      { targetName: 'Freigaben', token: DEMO_TOKENS.lead, load: loadApprovals },
      { targetName: 'Monatsabschluss', token: DEMO_TOKENS.hr, load: loadClosing },
      { targetName: 'Berichte', token: DEMO_TOKENS.hr, load: loadReports },
    ] as const;

    for (const workflow of workflows) {
      await page.goto('/de/settings', { waitUntil: 'domcontentloaded' });
      await page.getByLabel('Token').fill(workflow.token);
      await expect(page.locator('.cq-session-state')).toHaveAttribute('data-phase', 'ready');
      await expect(page.locator('.cq-mobile-header')).toBeVisible();

      const navigationToggle = page.locator('.cq-nav-toggle');
      await expect(navigationToggle).toBeVisible();
      const toggleBox = await navigationToggle.boundingBox();
      expect(toggleBox?.height).toBeGreaterThanOrEqual(44);

      await navigationToggle.click();
      const targetLink = page.getByRole('link', {
        name: workflow.targetName,
        exact: true,
        includeHidden: true,
      });
      if (!(await targetLink.isVisible())) {
        const targetGroup = page.locator('.cq-nav-block').filter({ has: targetLink });
        await targetGroup.locator('summary').click();
      }
      await expect(targetLink).toBeVisible();
      await targetLink.click();
      await workflow.load(page);
      await page.addStyleTag({
        content:
          '*, *::before, *::after { animation: none !important; transition: none !important; }',
      });
      await expectNoBlockingAccessibilityViolations(page);

      const viewportMetrics = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(viewportMetrics.documentWidth).toBeLessThanOrEqual(viewportMetrics.viewportWidth);
    }
    expect(unexpectedRequests).toEqual([]);
  });
});
