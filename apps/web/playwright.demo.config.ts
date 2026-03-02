import { defineConfig } from '@playwright/test';

const demoDatabaseUrl =
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=web_demo_screenshots';
const demoWebPort = 3310;
const demoWebBaseUrl = `http://localhost:${demoWebPort}`;
const demoCorsOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  demoWebBaseUrl,
  `http://127.0.0.1:${demoWebPort}`,
].join(',');

export default defineConfig({
  testDir: './tests/demo',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './test-results/demo-screenshots/playwright-output',
  use: {
    baseURL: demoWebBaseUrl,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'light',
    viewport: {
      width: 1440,
      height: 900,
    },
  },
  webServer: [
    {
      command: [
        `WEB_DB_URL=${demoDatabaseUrl}`,
        'DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/database db:push',
        'DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/database db:seed:demo',
        'DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/api build',
        `DATABASE_URL=$WEB_DB_URL CORS_ORIGINS=${demoCorsOrigins} AUTH_PROVIDER=mock AUTH_MODE=mock pnpm --filter @cueq/api start`,
      ].join(' && '),
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: [
        'pnpm --filter @cueq/web build',
        `pnpm --filter @cueq/web exec next start --port ${demoWebPort}`,
      ].join(' && '),
      url: `${demoWebBaseUrl}/de/dashboard`,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
