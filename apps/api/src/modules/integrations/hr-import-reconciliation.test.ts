import { BadRequestException } from '@nestjs/common';
import { Role, type Prisma } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { reconcileHrImportRows } from './hr-import-reconciliation.helper.js';
import type { ValidatedHrImportRow } from './hr-import-validation.js';

function rows(count: number): ValidatedHrImportRow[] {
  return Array.from({ length: count }, (_, index) => ({
    externalId: `person-${index}`,
    firstName: 'Test',
    lastName: String(index),
    email: `person-${index}@example.test`,
    role: Role.EMPLOYEE,
    organizationUnit: 'Test Unit',
    workTimeModel: 'Test Model',
    weeklyHours: '40',
    dailyTargetHours: '8',
    supervisorExternalId: index === 0 ? undefined : 'person-0',
    parsedRole: Role.EMPLOYEE,
    parsedWeeklyHours: 40,
    parsedDailyTargetHours: 8,
    organizationUnitId: 'ou_test',
    workTimeModelId: 'wtm_test',
    parsedEmploymentStartDate: null,
    parsedEmploymentEndDate: null,
  }));
}

describe('API HR import reconciliation batching', () => {
  it('writes 1,001 new people and supervisor links in batches of at most 500', async () => {
    const createBatchSizes: number[] = [];
    const createdPeople: Array<Record<string, unknown>> = [];
    const executeRaw = vi.fn(async () => 1);
    const transaction = {
      person: {
        findMany: vi.fn(async () => []),
        createManyAndReturn: vi.fn(async ({ data }: { data: Array<{ externalId: string }> }) => {
          createBatchSizes.push(data.length);
          createdPeople.push(...data);
          return data.map((person) => ({ id: `id-${person.externalId}`, ...person }));
        }),
      },
      $executeRaw: executeRaw,
      $queryRaw: vi.fn(async (query: { strings?: readonly string[] }) =>
        (Array.isArray(query) ? query.join('') : query.strings?.join(''))?.includes(
          'pg_try_advisory_xact_lock',
        )
          ? [{ acquired: true }]
          : [],
      ),
    } as unknown as Prisma.TransactionClient;

    const inputRows = rows(1_001);
    inputRows[0]!.employmentStartDate = '2026-09-08';
    inputRows[0]!.parsedEmploymentStartDate = new Date('2026-09-08T00:00:00.000Z');
    await expect(reconcileHrImportRows(transaction, inputRows)).resolves.toMatchObject({
      createdRows: 1_001,
      updatedRows: 0,
    });

    expect(createBatchSizes).toEqual([500, 500, 1]);
    expect(executeRaw).toHaveBeenCalledTimes(11);
    expect(transaction.person.findMany).toHaveBeenCalledTimes(1);
    expect(createdPeople[0]).toMatchObject({
      employmentStartDate: new Date('2026-09-08T00:00:00.000Z'),
      employmentEndDate: null,
    });
  });

  it('rejects a provided date that would rewrite existing employment history', async () => {
    const input = rows(1);
    input[0]!.employmentStartDate = '2026-09-08';
    input[0]!.parsedEmploymentStartDate = new Date('2026-09-08T00:00:00.000Z');
    const transaction = {
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
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      $executeRaw: vi.fn(),
    } as unknown as Prisma.TransactionClient;

    await expect(reconcileHrImportRows(transaction, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(transaction.$executeRaw).not.toHaveBeenCalled();
  });
});
