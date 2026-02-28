import { execSync } from 'node:child_process';
import { join } from 'node:path';

const DEFAULT_DATABASE_URL =
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';

let initialized = false;

function withSchema(databaseUrl: string, schema: string) {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

export function configureSuiteDatabase(schema: string) {
  if (initialized) {
    return;
  }

  const cwd = join(__dirname, '..', '..', '..', '..');
  const suiteDatabaseUrl = withSchema(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL, schema);

  process.env.DATABASE_URL = suiteDatabaseUrl;

  execSync('pnpm --filter @cueq/database exec prisma db push --skip-generate', {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: suiteDatabaseUrl,
    },
  });

  initialized = true;
}
