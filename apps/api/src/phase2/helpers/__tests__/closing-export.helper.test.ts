import { ClosingStatus, Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { ClosingExportHelper } from '../closing-export.helper.js';

const period = {
  id: 'closing-1',
  organizationUnitId: 'ou-1',
  periodStart: new Date('2026-06-01T00:00:00.000Z'),
  periodEnd: new Date('2026-06-30T23:59:59.999Z'),
  status: ClosingStatus.CLOSED,
};

function exportRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'export-existing',
    closingPeriodId: period.id,
    format: 'CSV_V1',
    checksum: 'existing-checksum',
    artifact: 'personId,targetHours,actualHours,balance\nperson-1,160.00,158.00,-2.00\n',
    contentType: 'text/csv',
    recordCount: 1,
    exportedById: 'actor-1',
    exportedAt: new Date('2026-07-18T00:00:00.000Z'),
    ...overrides,
  };
}

function buildHelper(
  existingRun?: Record<string, unknown>,
  accounts = [{ personId: 'person-1', targetHours: 160, actualHours: 158, balance: -2 }],
) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    closingPeriod: {
      findUnique: vi.fn().mockResolvedValue(period),
      update: vi.fn().mockResolvedValue({ ...period, status: ClosingStatus.EXPORTED }),
    },
    timeAccount: {
      findMany: vi.fn().mockResolvedValue(accounts),
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
    exportRun: { findFirst: vi.fn().mockResolvedValue(existingRun ?? null) },
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

  return { helper, prisma, tx, personHelper, auditHelper, eventOutboxHelper };
}

const user = {
  subject: 'actor-1',
  email: 'hr@example.invalid',
  role: Role.HR,
  claims: {},
};

describe('ClosingExportHelper atomic export', () => {
  it('serializes ordered XML rows with escaped attributes and a stable checksum', async () => {
    const closingPeriodId = 'closing-<&"\'-1';
    const { helper, tx } = buildHelper(undefined, [
      {
        personId: 'person-a<&"\'',
        targetHours: 2.345,
        actualHours: 1.2,
        balance: -1.145,
      },
      { personId: 'person-z', targetHours: 160, actualHours: 158, balance: -2 },
    ]);

    const result = await helper.exportClosing(user, closingPeriodId, { format: 'XML_V1' });

    expect(result.artifact).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<payrollExport format="XML_V1" closingPeriodId="closing-&lt;&amp;&quot;&apos;-1">
  <row personId="person-a&lt;&amp;&quot;&apos;" targetHours="2.35" actualHours="1.20" balance="-1.15" />
  <row personId="person-z" targetHours="160.00" actualHours="158.00" balance="-2.00" />
</payrollExport>
`);
    expect(result.checksum).toBe(
      'c31a7bb169bc86fbd85db34f4b0f8c35c2d771400c2bad6c944c4a10bcadba1b',
    );
    expect(result.rows.map((row) => row.personId)).toEqual(['person-a<&"\'', 'person-z']);
    expect(tx.timeAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { personId: 'asc' } }),
    );
    expect(tx.exportRun.findUnique).toHaveBeenCalledWith({
      where: {
        closingPeriodId_format_checksum: {
          closingPeriodId,
          format: 'XML_V1',
          checksum: result.checksum,
        },
      },
    });
  });

  it('checks export authorization before parsing an invalid format', async () => {
    const { helper, prisma, personHelper } = buildHelper();
    const unauthorizedUser = { ...user, role: Role.EMPLOYEE };

    await expect(
      helper.exportClosing(unauthorizedUser, period.id, { format: 'INVALID_FORMAT' }),
    ).rejects.toThrow('Only HR/Admin can export closing periods.');

    expect(personHelper.personForUser).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an invalid export format before resolving the actor or opening a transaction', async () => {
    const { helper, prisma, personHelper } = buildHelper();

    await expect(
      helper.exportClosing(user, period.id, { format: 'INVALID_FORMAT' }),
    ).rejects.toMatchObject({ name: 'ZodError' });

    expect(personHelper.personForUser).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

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

  it('keeps the locked lifecycle ordering through persistence and publication', async () => {
    const { helper, tx, auditHelper, eventOutboxHelper } = buildHelper();

    await helper.exportClosing(user, period.id, { format: 'CSV_V1' });

    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.closingPeriod.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(tx.closingPeriod.findUnique.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.timeAccount.findMany.mock.invocationCallOrder[0]!,
    );
    expect(tx.timeAccount.findMany.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.exportRun.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(tx.exportRun.findUnique.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.closingPeriod.update.mock.invocationCallOrder[0]!,
    );
    expect(tx.closingPeriod.update.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.exportRun.create.mock.invocationCallOrder[0]!,
    );
    expect(auditHelper.appendAudit.mock.invocationCallOrder[0]!).toBeLessThan(
      eventOutboxHelper.enqueueDomainEvent.mock.invocationCallOrder[0]!,
    );
  });

  it('reuses an identical committed export without emitting duplicate side effects', async () => {
    const existingRun = exportRun();
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
    const existingRun = exportRun();
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
    const existingRun = exportRun({ id: 'export-legacy', artifact: null, contentType: null });
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

  it('loads CSV and canonical artifacts through the same period-scoped lookup', async () => {
    const existingRun = exportRun();
    const { helper, prisma, auditHelper } = buildHelper(existingRun);

    await expect(
      helper.getExportRunCsv(user, period.id, existingRun.id as string),
    ).resolves.toEqual(
      expect.objectContaining({ csv: existingRun.artifact, contentType: 'text/csv' }),
    );
    await expect(
      helper.getExportRunArtifact(user, period.id, existingRun.id as string),
    ).resolves.toEqual(
      expect.objectContaining({ artifact: existingRun.artifact, format: 'CSV_V1' }),
    );

    expect(prisma.exportRun.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.exportRun.findFirst).toHaveBeenCalledWith({
      where: { id: existingRun.id, closingPeriodId: period.id },
    });
    expect(auditHelper.appendAudit.mock.calls.map(([entry]) => entry.after.endpoint)).toEqual([
      'csv',
      'artifact',
    ]);
  });

  it('does not resolve an export run outside the requested closing period', async () => {
    const { helper, prisma } = buildHelper();

    await expect(helper.getExportRunCsv(user, period.id, 'missing-run')).rejects.toThrow(
      'Export run not found.',
    );
    expect(prisma.exportRun.findFirst).toHaveBeenCalledWith({
      where: { id: 'missing-run', closingPeriodId: period.id },
    });
  });

  it('checks download authorization before resolving the actor or looking up a run', async () => {
    const { helper, prisma, personHelper, auditHelper } = buildHelper();
    const unauthorizedUser = { ...user, role: Role.EMPLOYEE };

    await expect(helper.getExportRunCsv(unauthorizedUser, period.id, 'export-1')).rejects.toThrow(
      'Only HR/Admin/Payroll can download payroll export CSV.',
    );

    expect(personHelper.personForUser).not.toHaveBeenCalled();
    expect(prisma.exportRun.findFirst).not.toHaveBeenCalled();
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });

  it('validates an unavailable downloaded artifact after period-scoped lookup and before audit', async () => {
    const unavailableRun = exportRun({ artifact: null });
    const { helper, prisma, personHelper, auditHelper } = buildHelper(unavailableRun);

    await expect(
      helper.getExportRunArtifact(user, period.id, unavailableRun.id as string),
    ).rejects.toThrow('Artifact is unavailable for this export run.');

    expect(personHelper.personForUser.mock.invocationCallOrder[0]!).toBeLessThan(
      prisma.exportRun.findFirst.mock.invocationCallOrder[0]!,
    );
    expect(prisma.exportRun.findFirst).toHaveBeenCalledWith({
      where: { id: unavailableRun.id, closingPeriodId: period.id },
    });
    expect(auditHelper.appendAudit).not.toHaveBeenCalled();
  });
});
