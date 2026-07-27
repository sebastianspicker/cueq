import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DATABASE_URL =
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';

const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(moduleDirectory, '..', '..', '..', '..');
const pnpmScript = join(repoRoot, 'scripts', 'pnpm.sh');

export function withSchema(databaseUrl: string, schema: string) {
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  return url.toString();
}

export function prismaPushReset(databaseUrl: string) {
  execFileSync(
    pnpmScript,
    [
      '--filter',
      '@cueq/database',
      'exec',
      'prisma',
      'db',
      'push',
      '--force-reset',
      '--skip-generate',
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );
}

type DatabaseScript = 'db:seed:phase2' | 'db:seed:phase3';

export function runDatabaseScript(script: DatabaseScript, databaseUrl: string) {
  execFileSync(pnpmScript, ['--filter', '@cueq/database', script], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
