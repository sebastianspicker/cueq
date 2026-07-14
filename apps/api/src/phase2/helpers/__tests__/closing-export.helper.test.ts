import { ClosingStatus, Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { ClosingExportHelper } from '../closing-export.helper';

const period = {
  id: 'closing-1',
  organizationUnitId: 'ou-1',
  periodStart: new Date('2026-06-01T00:00:00.000Z'),
  periodEnd: new Date('2026-06-30T23:59:59.999Z'),
  status: ClosingStatus.CLOSED,
};

function buildHelper(existingRun?: Record<string, unknown>) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    closingPeriod: {
      findUnique: vi.fn().mockResolvedValue(period),
      update: vi.fn().mockResolvedValue({ ...period, status: ClosingStatus.EXPORTED }),
    },
    timeAccount: {
      findMany: vi
        .fn()
        .mockResolvedValue([
          { personId: 'person-1', targetHours: 160, actualHours: 158, balance: -2 },
        ]),
    },
    exportRun: {
      findUnique: vi.fn().mockResolvedValue(existingRun ?? null),
      create: vi.fn().mockImplementation(async ({ data }) => ({ id: 'export-1', ...data })),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...existingRun, ...data })),
    },
    auditEntry: { create: vi.fn().mockResolvedValue({}) },
    domainEventOutbox: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const personHelper = {
    personForUser: vi.fn().mockResolvedValue({ id: 'actor-1', role: Role.HR }),
  };
  const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const eventOutboxHelper = { enqueueDomainEvent: vi.fn().mockResolvedValue({}) };
  const helper = new ClosingExportHelper(
    prisma as never,
    personHelper as never,
    auditHelper as never,
    eventOutboxHelper as never,
  );

  return { helper, prisma, tx, auditHelper, eventOutboxHelper };
}

const user = {
  subject: 'actor-1',
  email: 'hr@example.invalid',
  role: Role.HR,
  claims: {},
};

describe('ClosingExportHelper atomic export', () => {
  it('writes the status, export, audit, and outbox through one transaction client', async () => {
    const { helper, prisma, tx, auditHelper, eventOutboxHelper } = buildHelper();

    const result = await helper.exportClosing(user, period.id, { format: 'CSV_V1' });

    expect(result.exportRun.id).toBe('export-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.closingPeriod.update).toHaveBeenCalledTimes(1);
    expect(tx.exportRun.create).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
    expect(eventOutboxHelper.enqueueDomainEvent).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('reuses an identical committed export without emitting duplicate side effects', async () => {
    const existingRun = {
      id: 'export-existing',
      closingPeriodId: period.id,
      format: 'CSV_V1',
      checksum: 'existing-checksum',
      artifact: 'personId,targetHours,actualHours,balance\nperson-1,160.00,158.00,-2.00\n',
      contentType: 'text/csv',
      recordCount: 1,
      exportedById: 'actor-1',
      exportedAt: new Date(),
    };
    const { helper, tx, auditHelper, eventOutboxHelper } = buildHelper(existingRun);
    tx.closingPeriod.findUnique.mockResolvedValueOnce({
      ...period,
      status: ClosingStatus.EXPORTED,
    });

    const result = await helper.exportClosing(user, period.id, { format: 'CSV_V1' });

    expect(result.exportRun.id).toBe('export-existing');
    expect(tx.closingPeriod.update).not.toHaveBeenCalled();
    expect(tx.exportRun.create).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });

  it('does not report success when the transactional outbox participant fails', async () => {
    const { helper, eventOutboxHelper } = buildHelper();
    eventOutboxHelper.enqueueDomainEvent.mockRejectedValueOnce(new Error('outbox unavailable'));

    await expect(helper.exportClosing(user, period.id, { format: 'CSV_V1' })).rejects.toThrow(
      'outbox unavailable',
    );
  });

  it('reuses an identical prior run when a reapproved period is exported again', async () => {
    const existingRun = {
      id: 'export-existing',
      closingPeriodId: period.id,
      format: 'CSV_V1',
      checksum: 'existing-checksum',
      artifact: 'personId,targetHours,actualHours,balance\nperson-1,160.00,158.00,-2.00\n',
      contentType: 'text/csv',
      recordCount: 1,
      exportedById: 'actor-1',
      exportedAt: new Date(),
    };
    const { helper, tx, auditHelper, eventOutboxHelper } = buildHelper(existingRun);

    const result = await helper.exportClosing(user, period.id, { format: 'CSV_V1' });

    expect(result.exportRun.id).toBe('export-existing');
    expect(tx.closingPeriod.update).toHaveBeenCalledTimes(1);
    expect(tx.exportRun.create).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLOSING_EXPORTED', entityId: 'export-existing' }),
      tx,
    );
    expect(eventOutboxHelper.enqueueDomainEvent).toHaveBeenCalledTimes(1);
  });

  it('backfills a legacy missing artifact without creating a duplicate run', async () => {
    const existingRun = {
      id: 'export-legacy',
      closingPeriodId: period.id,
      format: 'CSV_V1',
      checksum: 'existing-checksum',
      artifact: null,
      contentType: null,
      recordCount: 1,
      exportedById: 'actor-1',
      exportedAt: new Date(),
    };
    const { helper, tx, auditHelper, eventOutboxHelper } = buildHelper(existingRun);
    tx.closingPeriod.findUnique.mockResolvedValueOnce({
      ...period,
      status: ClosingStatus.EXPORTED,
    });

    const result = await helper.exportClosing(user, period.id, { format: 'CSV_V1' });

    expect(result.exportRun.id).toBe('export-legacy');
    expect(result.artifact).toContain('personId,targetHours,actualHours,balance');
    expect(tx.exportRun.update).toHaveBeenCalledTimes(1);
    expect(tx.exportRun.create).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'EXPORT_ARTIFACT_BACKFILLED' }),
      tx,
    );
    expect(eventOutboxHelper.enqueueDomainEvent).not.toHaveBeenCalled();
  });
});
