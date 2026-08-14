import type { Page } from '@playwright/test';

export const employeeToken =
  'mock.eyJzdWIiOiJjMDAwMDAwMDAwMDAwMDAwMDAwMDAwMTAwIiwiZW1haWwiOiJlbXBsb3llZUBjdWVxLmxvY2FsIiwicm9sZSI6IkVNUExPWUVFIiwib3JnYW5pemF0aW9uVW5pdElkIjoiYzAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMSJ9';

export function mockToken(payload: Record<string, unknown>) {
  return `mock.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

export async function authenticateAndOpen(
  page: Page,
  locale: 'de' | 'en',
  token: string,
  navigationLabel: string,
) {
  await page.goto(`http://localhost:3000/${locale}/settings`);
  await page.getByLabel(locale === 'de' ? 'Token' : 'Bearer token').fill(token);
  await page.getByRole('link', { name: navigationLabel, exact: true }).click();
}

export async function changeToken(page: Page, locale: 'de' | 'en', token: string) {
  await page
    .getByRole('link', { name: locale === 'de' ? 'Einstellungen' : 'Settings', exact: true })
    .click();
  await page.getByLabel(locale === 'de' ? 'Token' : 'Bearer token').fill(token);
  await page.goBack();
}
