#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(
  'pnpm',
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
