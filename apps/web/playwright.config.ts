import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/acceptance',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
  },
  webServer: [
    {
      command:
        'WEB_DB_URL=postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=web_acceptance; DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/database db:push:force && DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/database db:seed:phase2 && DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/api... build && DATABASE_URL=$WEB_DB_URL AUTH_MODE=mock pnpm --filter @cueq/api start',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Acceptance tests exercise the deployed surface; using the production
      // server also avoids dev-mode file watchers on low-limit macOS runners.
      command: [
        'pnpm --filter @cueq/web... build',
        'pnpm --filter @cueq/web exec next start --port 3000',
      ].join(' && '),
      url: 'http://localhost:3000/de/dashboard',
      reuseExistingServer: true,
      timeout: 300_000,
    },
  ],
});
