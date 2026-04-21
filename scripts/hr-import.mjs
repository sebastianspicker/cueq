#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databasePackageDir = resolve(__dirname, '..', 'packages', 'database');
const result = spawnSync(
  'pnpm',
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
