import { defineConfig } from '@playwright/test';

const localDatabaseUrl = 'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';

function databaseUrlForSchema(schema: string): string {
  const url = new URL(process.env.DATABASE_URL ?? localDatabaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

const webDatabaseEnv = `DATABASE_URL=${shellQuote(databaseUrlForSchema('web_acceptance'))}`;

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
      command: [
        `${webDatabaseEnv} pnpm --filter @cueq/database db:push:force`,
        `${webDatabaseEnv} pnpm --filter @cueq/database db:seed:phase2`,
        `${webDatabaseEnv} pnpm --filter @cueq/api build`,
        `${webDatabaseEnv} AUTH_MODE=mock pnpm --filter @cueq/api start`,
      ].join(' && '),
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
