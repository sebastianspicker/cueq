import { ClosingStatus, Role, type Prisma } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { runClosingExportLifecycle } from './closing-export-lifecycle.js';

const period = {
  id: 'period-1',
  status: ClosingStatus.EXPORTED,
  organizationUnitId: 'ou-1',
  periodStart: new Date('2026-03-01T00:00:00.000Z'),
  periodEnd: new Date('2026-03-31T23:59:59.000Z'),
};

function account(id: string, periodStart: string, periodEnd: string) {
  return {
    id,
    personId: 'person-1',
    assignmentId: 'assignment-1',
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    targetHours: 80,
    actualHours: 81,
    balance: 1,
  };
}

describe('closing export lifecycle appointment accounts', () => {
  it('exports accounts already split at a term boundary as separate V2 rows', async () => {
    const accounts = [
      account('account-1', '2026-03-01T00:00:00.000Z', '2026-03-15T23:59:59.000Z'),
      account('account-2', '2026-03-16T00:00:00.000Z', '2026-03-31T23:59:59.000Z'),
    ];
    const findMany = vi.fn().mockResolvedValueOnce(accounts).mockResolvedValueOnce([]);
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'run-1',
      format: 'CSV_V2',
      checksum: data.checksum as string,
      artifact: data.artifact as string,
      contentType: data.contentType as string,
      recordCount: data.recordCount as number,
    }));
    const tx = {
      $queryRaw: vi.fn(async () => [{ acquired: true }]),
      closingPeriod: { findUnique: vi.fn(async () => period), update: vi.fn() },
      timeAccount: { findMany },
      exportRun: { findUnique: vi.fn(async () => null), create, update: vi.fn() },
    } as unknown as Prisma.TransactionClient;
    const resolveInterval = vi.fn(async () => ({ organizationUnitId: 'ou-1' }));

    const result = await runClosingExportLifecycle(
      tx,
      period.id,
      'CSV_V2',
      { id: 'actor-1', role: Role.HR },
      {
        assignmentHelper: { resolveInterval } as never,
        auditHelper: { appendAudit: vi.fn(async () => undefined) },
        eventOutboxHelper: { enqueueDomainEvent: vi.fn(async () => undefined) } as never,
        timeAccounts: { assertCompleteForClosing: vi.fn(async () => undefined) },
      },
    );

    expect(resolveInterval).toHaveBeenCalledTimes(2);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((row) => row.periodStart)).toEqual([
      '2026-03-01T00:00:00.000Z',
      '2026-03-16T00:00:00.000Z',
    ]);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ format: 'CSV_V2', recordCount: 2 }),
    });
  });

  it('returns committed V1 artifact bytes without rewriting the stored run', async () => {
    const existing = {
      id: 'run-v1',
      format: 'CSV_V1',
      checksum: 'stored-checksum',
      artifact: 'historical-v1-bytes\n',
      contentType: 'text/csv',
      recordCount: 1,
    };
    const update = vi.fn();
    const create = vi.fn();
    const tx = {
      $queryRaw: vi.fn(async () => [{ acquired: true }]),
      closingPeriod: { findUnique: vi.fn(async () => period), update: vi.fn() },
      timeAccount: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            account('account-1', '2026-03-01T00:00:00.000Z', '2026-03-31T23:59:59.000Z'),
          ])
          .mockResolvedValueOnce([]),
      },
      exportRun: { findUnique: vi.fn(async () => existing), create, update },
    } as unknown as Prisma.TransactionClient;

    const result = await runClosingExportLifecycle(
      tx,
      period.id,
      'CSV_V1',
      { id: 'actor-1', role: Role.HR },
      {
        assignmentHelper: {
          resolveInterval: vi.fn(async () => ({ organizationUnitId: 'ou-1' })),
        } as never,
        auditHelper: { appendAudit: vi.fn(async () => undefined) },
        eventOutboxHelper: { enqueueDomainEvent: vi.fn(async () => undefined) } as never,
        timeAccounts: { assertCompleteForClosing: vi.fn(async () => undefined) },
      },
    );

    expect(result.artifact).toBe('historical-v1-bytes\n');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
