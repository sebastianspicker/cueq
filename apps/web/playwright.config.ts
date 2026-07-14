import { defineConfig } from '@playwright/test';

const acceptanceDatabaseUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public',
);
acceptanceDatabaseUrl.searchParams.set('schema', 'web_acceptance');
const reuseExistingServer = process.env.PW_REUSE_EXISTING_SERVER === 'true' && !process.env.CI;

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
      command: `WEB_DB_URL=${JSON.stringify(acceptanceDatabaseUrl.toString())}; DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/database db:push:force && DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/database db:seed:phase2 && DATABASE_URL=$WEB_DB_URL pnpm --filter @cueq/api... build && DATABASE_URL=$WEB_DB_URL AUTH_MODE=mock pnpm --filter @cueq/api start`,
      url: 'http://localhost:3001/health',
      reuseExistingServer,
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
      reuseExistingServer,
      timeout: 300_000,
    },
  ],
});
