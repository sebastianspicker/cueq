import { describe, expect, it, vi } from 'vitest';
import { HrImportService } from './hr-import.service';
import type { HrMasterProviderPort } from './hr-master-provider.port';

function createRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    source: 'FILE',
    sourceFile: null,
    status: 'SUCCEEDED',
    totalRows: 0,
    createdRows: 0,
    updatedRows: 0,
    skippedRows: 0,
    errorCount: 0,
    summary: {},
    importedAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createService(txOverrides: Record<string, unknown> = {}) {
  const tx = {
    organizationUnit: { upsert: vi.fn().mockResolvedValue({}) },
    workTimeModel: { upsert: vi.fn().mockResolvedValue({}) },
    person: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
    ...txOverrides,
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    hrImportRun: { create: vi.fn(async ({ data }) => createRun(data)) },
  };
  const provider: HrMasterProviderPort = { fetchMasterRecords: vi.fn() };
  const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const service = new HrImportService(prisma as never, provider, auditHelper as never);

  return { service, prisma, tx, auditHelper };
}

describe('HrImportService', () => {
  it('imports valid CSV rows and links supervisors from the same batch', async () => {
    const { service, prisma, tx } = createService();
    tx.person.create
      .mockResolvedValueOnce({ id: 'person-lead' })
      .mockResolvedValueOnce({ id: 'person-employee' });
    tx.person.update.mockResolvedValue({ id: 'person-employee' });

    const result = await service.runImport('dev-hr-token', {
      source: 'FILE',
      csv: [
        'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
        'lead01,Lead,One,lead@cueq.local,TEAM_LEAD,HR,Full,39.83,7.97,',
        'emp01,Emp,One,emp@cueq.local,EMPLOYEE,HR,Full,39.83,7.97,lead01',
      ].join('\n'),
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.organizationUnit.upsert).toHaveBeenCalledTimes(2);
    expect(tx.workTimeModel.upsert).toHaveBeenCalledTimes(2);
    expect(tx.person.create).toHaveBeenCalledTimes(2);
    expect(tx.person.update).toHaveBeenCalledWith({
      where: { id: 'person-employee' },
      data: { supervisorId: 'person-lead' },
    });
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      totalRows: 2,
      createdRows: 2,
      updatedRows: 0,
      errorCount: 0,
    });
  });

  it('records a failed run when externalId and email resolve to different people', async () => {
    const { service, prisma, tx } = createService();
    tx.person.findUnique
      .mockResolvedValueOnce({ id: 'person-by-external-id' })
      .mockResolvedValueOnce({ id: 'person-by-email' });

    const result = await service.runImport('dev-hr-token', {
      source: 'FILE',
      csv: [
        'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
        'emp01,Emp,One,emp@cueq.local,EMPLOYEE,HR,Full,39.83,7.97',
      ].join('\n'),
    });

    expect(prisma.hrImportRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          errorCount: 1,
          summary: expect.objectContaining({
            errors: ['HR identity conflict for externalId="emp01" and email="emp@cueq.local".'],
          }),
        }),
      }),
    );
    expect(tx.person.create).not.toHaveBeenCalled();
    expect(tx.person.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'FAILED',
      errorCount: 1,
    });
  });

  it('records validation failures without opening a transaction', async () => {
    const { service, prisma } = createService();

    const result = await service.runImport('dev-hr-token', {
      source: 'FILE',
      csv: [
        'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
        'emp01,Emp,One,,EMPLOYEE,HR,Full,39.83,7.97',
      ].join('\n'),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'FAILED',
      totalRows: 1,
      skippedRows: 1,
      errorCount: 1,
    });
  });
});
