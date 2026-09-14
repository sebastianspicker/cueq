import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error JavaScript tooling has no declaration file.
import { importRowsInTransaction } from '../scripts/hr-import/persistence.mjs';

function rows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    externalId: `person-${index}`,
    firstName: 'Test',
    lastName: String(index),
    email: `person-${index}@example.test`,
    parsedRole: 'EMPLOYEE',
    organizationUnit: 'Test Unit',
    workTimeModel: 'Test Model',
    parsedWeeklyHours: 40,
    parsedDailyTargetHours: 8,
    supervisorExternalId: index === 0 ? undefined : 'person-0',
    organizationUnitId: 'ou_test',
    workTimeModelId: 'wtm_test',
    employmentStartDate: undefined as string | undefined,
    employmentEndDate: undefined as string | undefined,
    parsedEmploymentStartDate: null as Date | null,
    parsedEmploymentEndDate: null as Date | null,
  }));
}

describe('CLI HR import persistence batching', () => {
  it('retains one atomic transaction while bounding all row writes to 500', async () => {
    const createBatchSizes: number[] = [];
    const createdPeople: Array<Record<string, unknown>> = [];
    const executeRaw = vi.fn(async () => 1);
    const transaction = {
      $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) =>
        query.strings?.join('').includes('SELECT p.id FROM persons') ? [] : [{ acquired: true }],
      ),
      $executeRaw: executeRaw,
      person: {
        findMany: vi.fn(async () => []),
        createManyAndReturn: vi.fn(async ({ data }: { data: Array<{ externalId: string }> }) => {
          createBatchSizes.push(data.length);
          createdPeople.push(...data);
          return data.map((person) => ({ id: `id-${person.externalId}`, ...person }));
        }),
      },
      hrImportRun: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'run-1',
          importedAt: new Date('2026-09-07T00:00:00.000Z'),
          ...data,
        })),
      },
      auditEntry: { create: vi.fn(async () => undefined) },
    };
    const transactionRunner = vi.fn(async (operation: (tx: typeof transaction) => unknown) =>
      operation(transaction),
    );
    const baseSummary = {
      source: 'FILE',
      sourceFile: 'synthetic.csv',
      totalRows: 1_001,
      createdRows: 0,
      updatedRows: 0,
      skippedRows: 0,
      errorCount: 0,
      errors: [],
    };

    const inputRows = rows(1_001);
    inputRows[0]!.employmentStartDate = '2026-09-08';
    inputRows[0]!.parsedEmploymentStartDate = new Date('2026-09-08T00:00:00.000Z');
    await expect(
      importRowsInTransaction({ $transaction: transactionRunner }, inputRows, baseSummary),
    ).resolves.toMatchObject({ summary: { createdRows: 1_001, updatedRows: 0 } });

    expect(transactionRunner).toHaveBeenCalledTimes(1);
    expect(createBatchSizes).toEqual([500, 500, 1]);
    // Two reference upserts and two supervisor-link batches. Rows without a
    // supervisor remain untouched in the CLI mapping. Six appointment/term writes
    // initialize the same three 500-row batches.
    expect(executeRaw).toHaveBeenCalledTimes(10);
    expect(transaction.person.findMany).toHaveBeenCalledTimes(1);
    expect(createdPeople[0]).toMatchObject({
      employmentStartDate: new Date('2026-09-08T00:00:00.000Z'),
      employmentEndDate: null,
    });
  });

  it('rejects a provided date that differs from existing employment history', async () => {
    const inputRows = rows(1);
    inputRows[0]!.employmentStartDate = '2026-09-08';
    inputRows[0]!.parsedEmploymentStartDate = new Date('2026-09-08T00:00:00.000Z');
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      $executeRaw: vi.fn(),
      person: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'person-id',
            externalId: 'person-0',
            email: 'person-0@example.test',
            employmentStartDate: new Date('2026-09-07T00:00:00.000Z'),
            employmentEndDate: null,
          },
        ]),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (operation: (tx: typeof transaction) => unknown) =>
        operation(transaction),
      ),
    };

    await expect(importRowsInTransaction(prisma, inputRows, {})).rejects.toThrow(
      'employmentStartDate differs from stored history',
    );
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });
});
