import assert from 'node:assert/strict';
import test from 'node:test';
import { backfillPersonYear, ZERO_DELTA_MARKER } from './lib/leave-adjustment-backfill.mjs';

test('leave backfill locks and rechecks, then writes adjustment and one audit atomically', async () => {
  const events = [];
  let existing = null;
  const tx = {
    $queryRaw: async () => events.push('lock'),
    leaveAdjustment: {
      findFirst: async () => {
        events.push('read');
        return existing;
      },
      create: async ({ data }) => {
        events.push('adjustment');
        existing = { id: 'adjustment-1', ...data };
        return existing;
      },
    },
    auditEntry: {
      create: async ({ data }) => {
        events.push('audit');
        assert.equal(data.action, ZERO_DELTA_MARKER);
        assert.equal(data.after.deltaDays, 0);
      },
    },
  };
  const db = { $transaction: async (callback) => callback(tx) };
  const input = { personId: 'p1', year: 2026, reason: 'baseline', createdBy: 'system' };

  assert.deepEqual(await backfillPersonYear(db, input), { created: true, id: 'adjustment-1' });
  assert.deepEqual(await backfillPersonYear(db, input), { created: false, id: 'adjustment-1' });
  assert.deepEqual(events, ['lock', 'read', 'adjustment', 'audit', 'lock', 'read']);
});

test('leave backfill does not audit if the mutation fails', async () => {
  let auditWrites = 0;
  const tx = {
    $queryRaw: async () => undefined,
    leaveAdjustment: {
      findFirst: async () => null,
      create: async () => {
        throw new Error('write failed');
      },
    },
    auditEntry: { create: async () => (auditWrites += 1) },
  };
  const db = { $transaction: async (callback) => callback(tx) };
  await assert.rejects(
    backfillPersonYear(db, {
      personId: 'p1',
      year: 2026,
      reason: 'baseline',
      createdBy: 'system',
    }),
    /write failed/u,
  );
  assert.equal(auditWrites, 0);
});

test('concurrent leave workers converge to one adjustment after lock serialization', async () => {
  let existing = null;
  let creates = 0;
  let transactionQueue = Promise.resolve();
  const tx = {
    $queryRaw: async () => undefined,
    leaveAdjustment: {
      findFirst: async () => existing,
      create: async () => {
        creates += 1;
        existing = { id: 'adjustment-1' };
        return existing;
      },
    },
    auditEntry: { create: async () => undefined },
  };
  const db = {
    $transaction(callback) {
      const result = transactionQueue.then(() => callback(tx));
      transactionQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
  const input = { personId: 'p1', year: 2026, reason: 'baseline', createdBy: 'system' };
  const results = await Promise.all([backfillPersonYear(db, input), backfillPersonYear(db, input)]);
  assert.equal(creates, 1);
  assert.deepEqual(
    results.map((result) => result.created),
    [true, false],
  );
});
