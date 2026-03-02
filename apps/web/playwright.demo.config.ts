import { defineConfig } from '@playwright/test';

const demoDatabaseUrl =
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=web_demo_screenshots';

export default defineConfig({
  testDir: './tests/demo',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: './test-results/demo-screenshots/playwright-output',
  use: {
    baseURL: 'http://localhost:3000',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'dark',
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
        'DATABASE_URL=$WEB_DB_URL AUTH_PROVIDER=mock AUTH_MODE=mock pnpm --filter @cueq/api start',
      ].join(' && '),
      url: 'http://localhost:3001/health',
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: 'pnpm --filter @cueq/web dev',
      url: 'http://localhost:3000/de/dashboard',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
