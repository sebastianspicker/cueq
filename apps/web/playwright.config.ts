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
        'WEB_DB_URL=postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=web_acceptance; DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/database db:push:force && DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/database db:seed:phase2 && DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/api build && DATABASE_URL=$WEB_DB_URL AUTH_MODE=mock pnpm --filter @cueq/api start',
      url: 'http://localhost:3001/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @cueq/web dev',
      url: 'http://localhost:3000/de/dashboard',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
