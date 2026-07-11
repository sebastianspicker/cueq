import assert from 'node:assert/strict';
import test from 'node:test';
import { backfillWorkflow, workflowBackfillPatch } from './lib/workflow-backfill.mjs';

const CREATED_AT = new Date('2026-03-01T08:00:00.000Z');

test('workflow patch fills null fields only and preserves terminal dueAt', () => {
  const existingDueAt = new Date('2026-03-03T08:00:00.000Z');
  const patch = workflowBackfillPatch(
    {
      createdAt: CREATED_AT,
      submittedAt: null,
      dueAt: existingDueAt,
      delegationTrail: null,
      approverId: 'approver-1',
      status: 'APPROVED',
    },
    48,
  );
  assert.deepEqual(patch, { submittedAt: CREATED_AT, delegationTrail: ['approver-1'] });
  assert.equal(patch.dueAt, undefined);
});

test('workflow backfill locks, rereads, updates and audits once; rerun is a no-op', async () => {
  const events = [];
  let workflow = {
    id: 'workflow-1',
    type: 'LEAVE_REQUEST',
    status: 'PENDING',
    createdAt: CREATED_AT,
    submittedAt: null,
    dueAt: null,
    delegationTrail: null,
    approverId: 'approver-1',
  };
  const tx = {
    $queryRaw: async () => events.push('lock'),
    workflowInstance: {
      findUnique: async () => {
        events.push('read');
        return workflow;
      },
      update: async ({ data }) => {
        events.push('workflow');
        workflow = { ...workflow, ...data };
        return workflow;
      },
    },
    auditEntry: { create: async () => events.push('audit') },
  };
  const db = { $transaction: async (callback) => callback(tx) };
  const input = { workflowId: 'workflow-1', deadlineHours: 48, actorId: 'system' };

  assert.deepEqual(await backfillWorkflow(db, input), { updated: true });
  assert.deepEqual(await backfillWorkflow(db, input), { updated: false });
  assert.deepEqual(events, ['lock', 'read', 'workflow', 'audit', 'lock', 'read']);
});

test('concurrent workflow workers converge to one mutation after lock serialization', async () => {
  let updates = 0;
  let transactionQueue = Promise.resolve();
  let workflow = {
    id: 'workflow-1',
    status: 'PENDING',
    createdAt: CREATED_AT,
    submittedAt: null,
    dueAt: null,
    delegationTrail: null,
    approverId: 'approver-1',
  };
  const tx = {
    $queryRaw: async () => undefined,
    workflowInstance: {
      findUnique: async () => workflow,
      update: async ({ data }) => {
        updates += 1;
        workflow = { ...workflow, ...data };
        return workflow;
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
  const input = { workflowId: 'workflow-1', deadlineHours: 48, actorId: 'system' };
  const results = await Promise.all([backfillWorkflow(db, input), backfillWorkflow(db, input)]);
  assert.equal(updates, 1);
  assert.deepEqual(
    results.map((result) => result.updated),
    [true, false],
  );
});
