#!/usr/bin/env node

/**
 * Runs the workflow-field backfill inside the database workspace with the
 * pinned package manager. The delegated command preserves rerun safety and
 * reports its mutation result through the original exit code and streams.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(
  resolve(import.meta.dirname, 'pnpm.sh'),
  ['exec', 'node', 'scripts/backfill-workflow-fields.mjs', ...process.argv.slice(2)],
  {
    cwd: resolve(import.meta.dirname, '../packages/database'),
    env: process.env,
    encoding: 'utf8',
  },
);
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.status ?? 1;
