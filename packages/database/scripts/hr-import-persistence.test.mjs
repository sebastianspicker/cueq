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

function rowFor(overrides) {
  return { ...row, ...overrides };
}

function fakePrisma(trace, { acquired = true, existingPeople = [], failCreate = false } = {}) {
  const calls = [];
  const tx = {
    $queryRaw: async (_strings, namespace) => {
      trace.push(`lock:${namespace}`);
      return [{ acquired }];
    },
    organizationUnit: {
      upsert: async ({ where }) => trace.push(`organizationUnit.upsert:${where.id}`),
    },
    workTimeModel: {
      upsert: async ({ where }) => trace.push(`workTimeModel.upsert:${where.id}`),
    },
    person: {
      findMany: async (query) => {
        calls.push({ operation: 'person.findMany', query });
        trace.push('person.findMany');
        return existingPeople;
      },
      create: async ({ data }) => {
        trace.push(`person.create:${data.externalId}`);
        if (failCreate) throw new Error('write failed');
        return { id: `created-${data.externalId}` };
      },
      update: async ({ where, data }) => {
        trace.push(
          data.supervisorId
            ? `person.link:${where.id}->${data.supervisorId}`
            : `person.update:${where.id}`,
        );
        return { id: where.id };
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
    calls,
    $transaction: async (callback) => {
      trace.push('transaction');
      return callback(tx);
    },
  };
}

test('imports shared references once, batches identity reads, and keeps person writes ordered', async () => {
  const trace = [];
  const prisma = fakePrisma(trace, {
    existingPeople: [{ id: 'existing-E-2', externalId: 'E-2', email: 'grace@example.test' }],
  });
  const rows = [
    row,
    rowFor({
      externalId: 'E-2',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.test',
    }),
    rowFor({
      externalId: 'E-3',
      firstName: 'Katherine',
      lastName: 'Johnson',
      email: 'kj@example.test',
    }),
  ];

  const result = await importRowsInTransaction(prisma, rows, {
    ...summary,
    totalRows: rows.length,
  });

  assert.deepEqual(trace, [
    'transaction',
    'lock:1138425457',
    'person.findMany',
    'organizationUnit.upsert:ou_math',
    'workTimeModel.upsert:wtm_default',
    'person.create:E-1',
    'person.update:existing-E-2',
    'person.create:E-3',
    'run:SUCCEEDED',
    'audit',
  ]);
  assert.deepEqual(prisma.calls, [
    {
      operation: 'person.findMany',
      query: {
        where: {
          OR: [
            { externalId: { in: ['E-1', 'E-2', 'E-3'] } },
            {
              email: {
                in: ['ada@example.test', 'grace@example.test', 'kj@example.test'],
                mode: 'insensitive',
              },
            },
          ],
        },
        select: { id: true, externalId: true, email: true },
      },
    },
  ]);
  assert.equal(result.run.status, 'SUCCEEDED');
  assert.deepEqual(result.summary, {
    ...summary,
    totalRows: rows.length,
    createdRows: 2,
    updatedRows: 1,
  });
});

test('preserves the external-ID/email conflict message before writes', async () => {
  const trace = [];
  const prisma = fakePrisma(trace, {
    existingPeople: [
      { id: 'person-by-external-id', externalId: row.externalId, email: 'other@example.test' },
      { id: 'person-by-email', externalId: 'E-other', email: row.email },
    ],
  });

  await assert.rejects(importRowsInTransaction(prisma, [row], summary), {
    message: 'HR identity conflict for externalId="E-1" and email="ada@example.test".',
  });
  assert.deepEqual(trace, ['transaction', 'lock:1138425457', 'person.findMany']);
});

test('resolves preexisting and in-batch supervisors without additional reads', async () => {
  const trace = [];
  const prisma = fakePrisma(trace, {
    existingPeople: [
      { id: 'preexisting-supervisor', externalId: 'E-manager', email: 'manager@example.test' },
    ],
  });
  const rows = [
    rowFor({ externalId: 'E-1', supervisorExternalId: 'E-manager' }),
    rowFor({
      externalId: 'E-2',
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.test',
      supervisorExternalId: 'E-1',
    }),
  ];

  await importRowsInTransaction(prisma, rows, { ...summary, totalRows: rows.length });

  assert.deepEqual(trace, [
    'transaction',
    'lock:1138425457',
    'person.findMany',
    'organizationUnit.upsert:ou_math',
    'workTimeModel.upsert:wtm_default',
    'person.create:E-1',
    'person.create:E-2',
    'person.link:created-E-1->preexisting-supervisor',
    'person.link:created-E-2->created-E-1',
    'run:SUCCEEDED',
    'audit',
  ]);
  assert.deepEqual(prisma.calls[0].query.where.OR[0], {
    externalId: { in: ['E-1', 'E-2', 'E-manager'] },
  });
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

test('write failures roll back the import, then record one failed run and audit entry', async () => {
  const trace = [];
  const prisma = fakePrisma(trace, { failCreate: true });
  await assert.rejects(
    runWithFailureLedger(prisma, summary, () => importRowsInTransaction(prisma, [row], summary)),
    /write failed/u,
  );
  assert.deepEqual(trace, [
    'transaction',
    'lock:1138425457',
    'person.findMany',
    'organizationUnit.upsert:ou_math',
    'workTimeModel.upsert:wtm_default',
    'person.create:E-1',
    'transaction',
    'run:FAILED',
    'audit',
  ]);
});
