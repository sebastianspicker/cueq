import assert from 'node:assert/strict';
import test from 'node:test';
import { runDatabaseWorkspaceScript } from './lib/database-cli-delegation.mjs';

test('database CLI delegation preserves arguments, streams, environment, and status', () => {
  const calls = [];
  const stdout = [];
  const stderr = [];
  const env = { CUEQ_TEST_ENV: 'present' };

  const status = runDatabaseWorkspaceScript('hr-import.mjs', {
    args: ['--dry-run', 'fixture.csv'],
    env,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return { status: 7, stdout: 'delegated stdout', stderr: 'delegated stderr' };
    },
    stdout: { write: (value) => stdout.push(value) },
    stderr: { write: (value) => stderr.push(value) },
  });

  assert.equal(status, 7);
  assert.deepEqual(stdout, ['delegated stdout']);
  assert.deepEqual(stderr, ['delegated stderr']);
  assert.equal(calls.length, 1);
  assert.match(calls[0].command, /scripts\/pnpm\.sh$/u);
  assert.deepEqual(calls[0].args, [
    'exec',
    'node',
    'scripts/hr-import.mjs',
    '--dry-run',
    'fixture.csv',
  ]);
  assert.match(calls[0].options.cwd, /packages\/database$/u);
  assert.equal(calls[0].options.env, env);
  assert.equal(calls[0].options.encoding, 'utf8');
});

test('database CLI delegation maps missing child status to failure without empty writes', () => {
  let writes = 0;

  const status = runDatabaseWorkspaceScript('backup-restore-verify.mjs', {
    spawn: () => ({ status: null, stdout: '', stderr: '' }),
    stdout: { write: () => (writes += 1) },
    stderr: { write: () => (writes += 1) },
  });

  assert.equal(status, 1);
  assert.equal(writes, 0);
});
