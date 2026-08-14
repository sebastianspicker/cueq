/** Shared process boundary for root CLIs implemented by the database workspace. */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPTS_ROOT = resolve(import.meta.dirname, '..');
const DATABASE_PACKAGE_ROOT = resolve(SCRIPTS_ROOT, '..', 'packages', 'database');

/** Runs one database-package script with the repository-pinned package manager. */
export function runDatabaseWorkspaceScript(
  scriptName,
  {
    args = process.argv.slice(2),
    env = process.env,
    spawn = spawnSync,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const result = spawn(
    resolve(SCRIPTS_ROOT, 'pnpm.sh'),
    ['exec', 'node', `scripts/${scriptName}`, ...args],
    {
      cwd: DATABASE_PACKAGE_ROOT,
      env,
      encoding: 'utf8',
    },
  );

  if (result.stdout) stdout.write(result.stdout);
  if (result.stderr) stderr.write(result.stderr);
  return result.status ?? 1;
}
