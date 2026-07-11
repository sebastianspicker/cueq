import assert from 'node:assert/strict';
import test from 'node:test';
import { FIXED_SEED_TIMESTAMP, stableCuid } from './seed-helpers.mjs';

test('stableCuid is deterministic, fixed-width, and collision-free for distinct indexes', () => {
  assert.equal(stableCuid(42), 'c000000000000000000000042');
  assert.equal(stableCuid(42), stableCuid(42));
  assert.notEqual(stableCuid(42), stableCuid(43));
});

test('seed timestamps are fixed rather than wall-clock derived', () => {
  assert.equal(FIXED_SEED_TIMESTAMP.toISOString(), '2026-03-01T00:00:00.000Z');
});
