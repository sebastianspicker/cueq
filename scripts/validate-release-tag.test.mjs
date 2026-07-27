import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidAlphaTag } from './validate-release-tag.mjs';

test('accepts canonical source-alpha tags', () => {
  assert.equal(isValidAlphaTag('v0.1.0-alpha.1'), true);
  assert.equal(isValidAlphaTag('v12.34.56-alpha.7'), true);
});

test('rejects malformed or non-alpha tags', () => {
  for (const tag of [
    '',
    '0.1.0-alpha.1',
    'v0.1-alpha.1',
    'v0.1.0',
    'v0.1.0-alpha',
    'v0.1.0-beta.1',
    'v01.1.0-alpha.1',
    'v0.1.0-alpha.01',
  ]) {
    assert.equal(isValidAlphaTag(tag), false, tag);
  }
});
