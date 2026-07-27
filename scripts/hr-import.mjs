#!/usr/bin/env node

/**
 * Delegates the HR import CLI to the database workspace so the pinned Prisma
 * client and package dependencies are used. Import validation, dry-run, audit,
 * and mutation semantics remain in the delegated implementation.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databasePackageDir = resolve(__dirname, '..', 'packages', 'database');
const pnpmScript = resolve(__dirname, 'pnpm.sh');
const result = spawnSync(
  pnpmScript,
  ['exec', 'node', 'scripts/hr-import.mjs', ...process.argv.slice(2)],
  {
    cwd: databasePackageDir,
    env: {
      ...process.env,
    },
    encoding: 'utf8',
  },
);

if (result.stdout) {
  process.stdout.write(result.stdout);
}

if (result.stderr) {
  process.stderr.write(result.stderr);
}

process.exit(result.status ?? 1);
