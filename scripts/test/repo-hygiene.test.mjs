import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const checker = join(root, 'scripts/check-repo-hygiene.sh');

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'cueq-hygiene-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith('GIT_')) delete env[name];
  }
  const run = (command, args) => spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  assert.equal(run('git', ['init', '--quiet']).status, 0);
  // Exercise the same ignore behavior on case-sensitive Linux CI and macOS.
  assert.equal(run('git', ['config', 'core.ignorecase', 'true']).status, 0);
  copyFileSync(join(root, '.gitignore'), join(cwd, '.gitignore'));
  return { cwd, run };
}

test('local credentials, database files, and generated output remain private when force-added', (t) => {
  const { cwd, run } = fixture(t);
  const paths = [
    '.mcp.json',
    '.codacy/report.json',
    'secrets.local.json',
    'nested/credentials.local.json',
    'nested/.npmrc.local',
    'nested/.env.production',
    'nested/snapshot.dump',
    'nested/snapshot.backup',
    'nested/local.db',
    'nested/local.db-wal',
    'nested/local.sqlite',
    'nested/local.sqlite3-shm',
    'packages/database/generated/client.js',
    'contracts/openapi/openapi.generated.json',
  ];
  for (const path of paths) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), 'synthetic test fixture\n');
    assert.equal(run('git', ['check-ignore', '--quiet', path]).status, 0, path);
  }
  assert.equal(run('git', ['add', '--force', '--', ...paths]).status, 0);
  const result = run('bash', [checker]);
  assert.equal(result.status, 1, result.stderr);
  for (const path of paths) assert.ok(result.stderr.includes(path), path);
});

test('public release docs, environment templates, migrations, and tour images stay publishable', (t) => {
  const { cwd, run } = fixture(t);
  const paths = [
    'RELEASE_STATUS.md',
    '.env.example',
    'apps/api/.env.example',
    'apps/api/.env.test.example',
    'apps/api/.env.sample',
    'apps/api/.env.template',
    'packages/database/prisma/migrations/example/migration.sql',
    'docs/assets/screenshots/demo/example.png',
  ];
  for (const path of paths) {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), 'synthetic public fixture\n');
    assert.equal(run('git', ['check-ignore', '--quiet', path]).status, 1, path);
  }
  assert.equal(run('git', ['add', '--', ...paths]).status, 0);
  const result = run('bash', [checker]);
  assert.equal(result.status, 0, result.stderr);
});
