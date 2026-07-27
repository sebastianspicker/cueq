import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const webPackagePath = new URL('../apps/web/package.json', import.meta.url);

test('web development server passes the loopback default to Next.js', async () => {
  const webPackage = JSON.parse(await readFile(webPackagePath, 'utf8'));
  const command = webPackage.scripts.dev.replace(/^next dev/u, "printf '%s\\n'");
  const result = spawnSync(command, { encoding: 'utf8', shell: true });

  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split('\n'), ['--hostname', '127.0.0.1', '--port', '3000']);
});

test('web development server passes CUEQ_DEV_HOST to Next.js when set', async () => {
  const webPackage = JSON.parse(await readFile(webPackagePath, 'utf8'));
  const command = webPackage.scripts.dev.replace(/^next dev/u, "printf '%s\\n'");
  const result = spawnSync(command, {
    encoding: 'utf8',
    env: { ...process.env, CUEQ_DEV_HOST: '0.0.0.0' },
    shell: true,
  });

  assert.equal(result.status, 0);
  assert.deepEqual(result.stdout.trim().split('\n'), ['--hostname', '0.0.0.0', '--port', '3000']);
});
