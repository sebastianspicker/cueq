import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const pnpmCommand = JSON.stringify(resolve(process.cwd(), '../../scripts/pnpm.sh'));

const dataSource = process.env.CUEQ_DEMO_SCREENSHOT_DATA_SOURCE ?? 'fixture';
if (dataSource !== 'fixture' && dataSource !== 'database') {
  throw new Error(
    `CUEQ_DEMO_SCREENSHOT_DATA_SOURCE must be "fixture" or "database", received: ${dataSource}`,
  );
}
const browserChannel = process.env.CUEQ_DEMO_SCREENSHOT_BROWSER_CHANNEL || undefined;
const browserExecutablePath = process.env.CUEQ_DEMO_SCREENSHOT_EXECUTABLE_PATH || undefined;
const browserNameValue = process.env.CUEQ_DEMO_SCREENSHOT_BROWSER_NAME;
if (browserNameValue && !['chromium', 'firefox', 'webkit'].includes(browserNameValue)) {
  throw new Error(`Unsupported demo screenshot browser: ${browserNameValue}`);
}
const browserName = browserNameValue as 'chromium' | 'firefox' | 'webkit' | undefined;

const demoDatabaseUrl =
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=web_demo_screenshots';
// Browser harness only: production startup never uses this deterministic fallback.
const testWebhookEncryptionKey = JSON.stringify(
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ?? Buffer.alloc(32, 1).toString('base64'),
);
const demoWebHost = '127.0.0.1';
const demoWebPort = 3310;
const databaseWebBaseUrl = `http://${demoWebHost}:${demoWebPort}`;
const fixtureWebBaseUrl = 'http://cueq.test';
const demoCorsOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  databaseWebBaseUrl,
  `http://127.0.0.1:${demoWebPort}`,
].join(',');

const databaseServer = {
  command: [
    `WEB_DB_URL=${demoDatabaseUrl}`,
    `DATABASE_URL=$WEB_DB_URL ${pnpmCommand} --filter @cueq/database db:push`,
    `DATABASE_URL=$WEB_DB_URL ${pnpmCommand} --filter @cueq/database db:seed:demo`,
    `DATABASE_URL=$WEB_DB_URL ${pnpmCommand} --filter @cueq/api build`,
    `DATABASE_URL=$WEB_DB_URL CORS_ORIGINS=${demoCorsOrigins} WEBHOOK_SECRET_ENCRYPTION_KEY=${testWebhookEncryptionKey} AUTH_PROVIDER=mock AUTH_MODE=mock ${pnpmCommand} --filter @cueq/api start`,
  ].join(' && '),
  url: 'http://localhost:3001/health',
  reuseExistingServer: false,
  timeout: 180_000,
};

const webServer = {
  command: [
    `${pnpmCommand} --filter @cueq/web build`,
    `${pnpmCommand} --filter @cueq/web exec next start --hostname ${demoWebHost} --port ${demoWebPort}`,
  ].join(' && '),
  url: `${databaseWebBaseUrl}/de/dashboard`,
  reuseExistingServer: false,
  timeout: 300_000,
};

export default defineConfig({
  testDir: './tests/demo',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: `./test-results/demo-screenshots/playwright-output-${dataSource}`,
  use: {
    baseURL: dataSource === 'database' ? databaseWebBaseUrl : fixtureWebBaseUrl,
    browserName,
    channel: browserChannel,
    launchOptions: browserExecutablePath ? { executablePath: browserExecutablePath } : undefined,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    colorScheme: 'light',
    viewport: {
      width: 1440,
      height: 900,
    },
  },
  webServer: dataSource === 'database' ? [databaseServer, webServer] : undefined,
});
