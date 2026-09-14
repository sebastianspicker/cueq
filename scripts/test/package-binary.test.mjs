import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packageBinary } from '../lib/package-binary.mjs';

test('missing package binary reports its package instead of a ReferenceError', () => {
  assert.throws(() => packageBinary('/tmp/pkg/package.json', { name: 'example' }, 'tsc'), {
    name: 'Error',
    message: 'example does not expose the tsc binary.',
  });
  assert.equal(
    packageBinary('/tmp/pkg/package.json', { bin: { tsc: 'bin/tsc' } }, 'tsc'),
    '/tmp/pkg/bin/tsc',
  );
  assert.equal(
    packageBinary('/tmp/pkg/package.json', { bin: 'bin/tsc' }, 'tsc'),
    '/tmp/pkg/bin/tsc',
  );
});
