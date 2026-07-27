import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const pnpmCommand = JSON.stringify(resolve(process.cwd(), '../../scripts/pnpm.sh'));

const acceptanceDatabaseUrl = new URL(
  process.env.DATABASE_URL ??
    'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public',
);
acceptanceDatabaseUrl.searchParams.set('schema', 'web_acceptance');
const reuseExistingServer = process.env.PW_REUSE_EXISTING_SERVER === 'true' && !process.env.CI;
// Browser harness only: production startup never uses this deterministic fallback.
const testWebhookEncryptionKey = JSON.stringify(
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? Buffer.alloc(32, 1).toString('base64'),
);

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
      command: `WEB_DB_URL=${JSON.stringify(acceptanceDatabaseUrl.toString())}; DATABASE_URL=$WEB_DB_URL ${pnpmCommand} --filter @cueq/database db:push:force && DATABASE_URL=$WEB_DB_URL ${pnpmCommand} --filter @cueq/database db:seed:phase2 && DATABASE_URL=$WEB_DB_URL ${pnpmCommand} --filter @cueq/api... build && DATABASE_URL=$WEB_DB_URL WEBHOOK_SECRET_ENCRYPTION_KEY=${testWebhookEncryptionKey} AUTH_PROVIDER=mock AUTH_MODE=mock ${pnpmCommand} --filter @cueq/api start`,
      url: 'http://localhost:3001/health',
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      // Acceptance tests exercise the deployed surface; using the production
      // server also avoids dev-mode file watchers on low-limit macOS runners.
      command: [
        `${pnpmCommand} --filter @cueq/web... build`,
        `${pnpmCommand} --filter @cueq/web exec next start --port 3000`,
      ].join(' && '),
      url: 'http://localhost:3000/de/dashboard',
      reuseExistingServer,
      timeout: 300_000,
    },
  ],
});
