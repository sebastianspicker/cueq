import assert from 'node:assert/strict';
import test from 'node:test';
import { importRowsInTransaction } from './hr-import/persistence.mjs';
import { runWithFailureLedger } from './hr-import/run-ledger.mjs';

const row = {
  externalId: 'E-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.test',
  parsedRole: 'EMPLOYEE',
  organizationUnit: 'Math',
  organizationUnitId: 'ou_math',
  workTimeModel: 'Default',
  workTimeModelId: 'wtm_default',
  parsedWeeklyHours: 39.83,
  parsedDailyTargetHours: 7.97,
};

const summary = {
  source: 'FILE',
  sourceFile: 'people.csv',
  totalRows: 1,
  createdRows: 0,
  updatedRows: 0,
  skippedRows: 0,
  errorCount: 0,
  errors: [],
};

function fakePrisma(trace, { acquired = true, failCreate = false } = {}) {
  const tx = {
    $queryRaw: async (_strings, namespace) => {
      trace.push(`lock:${namespace}`);
      return [{ acquired }];
    },
    organizationUnit: { upsert: async () => trace.push('organizationUnit.upsert') },
    workTimeModel: { upsert: async () => trace.push('workTimeModel.upsert') },
    person: {
      findUnique: async () => {
        trace.push('person.findUnique');
        return null;
      },
      findFirst: async () => {
        trace.push('person.findFirst');
        return null;
      },
      create: async () => {
        trace.push('person.create');
        if (failCreate) throw new Error('write failed');
        return { id: 'person-1' };
      },
      update: async () => {
        trace.push('person.update');
        return { id: 'person-1' };
      },
    },
    hrImportRun: {
      create: async ({ data }) => {
        trace.push(`run:${data.status}`);
        return {
          id: `${data.status}-1`,
          status: data.status,
          importedAt: new Date('2026-08-07T00:00:00.000Z'),
        };
      },
    },
    auditEntry: { create: async () => trace.push('audit') },
  };
  return {
    $transaction: async (callback) => {
      trace.push('transaction');
      return callback(tx);
    },
  };
}

test('import transaction takes the lock, preflights, writes serially, then records success and audit', async () => {
  const trace = [];
  const result = await importRowsInTransaction(fakePrisma(trace), [row], summary);

  assert.deepEqual(trace, [
    'transaction',
    'lock:1138425457',
    'person.findUnique',
    'person.findFirst',
    'organizationUnit.upsert',
    'workTimeModel.upsert',
    'person.findUnique',
    'person.findFirst',
    'person.create',
    'run:SUCCEEDED',
    'audit',
  ]);
  assert.equal(result.run.status, 'SUCCEEDED');
  assert.deepEqual(result.summary, { ...summary, createdRows: 1, updatedRows: 0 });
});

test('a held advisory lock does not create a failed run or audit record', async () => {
  const trace = [];
  await assert.rejects(
    runWithFailureLedger(fakePrisma(trace, { acquired: false }), summary, () =>
      importRowsInTransaction(fakePrisma(trace, { acquired: false }), [row], summary),
    ),
    /HR_IMPORT_IN_PROGRESS/u,
  );
  assert.deepEqual(trace, ['transaction', 'lock:1138425457']);
});

test('other import failures record a failed run and audit, then rethrow', async () => {
  const trace = [];
  const prisma = fakePrisma(trace, { failCreate: true });
  await assert.rejects(
    runWithFailureLedger(prisma, summary, () => importRowsInTransaction(prisma, [row], summary)),
    /write failed/u,
  );
  assert.deepEqual(trace.slice(-3), ['transaction', 'run:FAILED', 'audit']);
});
