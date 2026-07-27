#!/usr/bin/env node

/**
 * Runs the leave-adjustment backfill inside the database workspace so it uses
 * the pinned toolchain and package-local Prisma client. The delegated command
 * owns dry-run, idempotency, audit, and database-mutation behavior.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(
  resolve(import.meta.dirname, 'pnpm.sh'),
  ['exec', 'node', 'scripts/backfill-leave-adjustments.mjs', ...process.argv.slice(2)],
  {
    cwd: resolve(import.meta.dirname, '../packages/database'),
    env: process.env,
    encoding: 'utf8',
  },
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
