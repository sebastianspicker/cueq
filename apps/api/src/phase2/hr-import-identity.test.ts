import { describe, expect, it } from 'vitest';
import { createService } from './hr-import-test-support.js';

describe('HrImportService', () => {
  it('clears an existing supervisor when the authoritative row has a blank supervisorExternalId', async () => {
    const { service, tx } = createService();
    tx.person.findUnique.mockResolvedValue({ id: 'person-employee' });
    tx.person.update.mockResolvedValue({ id: 'person-employee' });

    await service.runImport('dev-hr-token', {
      source: 'FILE',
      csv: [
        'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
        'emp01,Emp,One,emp@cueq.local,EMPLOYEE,HR,Full,39.83,7.97,',
      ].join('\n'),
    });

    expect(tx.person.update).toHaveBeenLastCalledWith({
      where: { id: 'person-employee' },
      data: { supervisorId: null },
    });
  });

  it('locks each existing person before updating HR-managed identity fields', async () => {
    const { service, tx } = createService();
    tx.person.findUnique.mockResolvedValue({ id: 'person-existing' });
    tx.person.update.mockResolvedValue({ id: 'person-existing' });

    await service.runImport('dev-hr-token', {
      source: 'FILE',
      csv: [
        'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
        'emp01,Emp,One,emp@cueq.local,EMPLOYEE,HR,Full,39.83,7.97',
      ].join('\n'),
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.calls[1]?.[1]).toBe('cueq:person-write:person-existing');
    expect(tx.person.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'person-existing' } }),
    );
  });

  it('keeps the advisory-lock, person-lock, preflight, and write ordering', async () => {
    const { service, tx } = createService();
    const events: string[] = [];
    tx.$queryRaw.mockImplementation(async (...args: unknown[]) => {
      events.push(args[1] === 'cueq:person-write:person-existing' ? 'person-lock' : 'import-lock');
      return [{ acquired: true }];
    });
    tx.person.findUnique.mockImplementation(async () => {
      events.push('find-external-id');
      return { id: 'person-existing' };
    });
    tx.person.findFirst.mockImplementation(async () => {
      events.push('find-email');
      return null;
    });
    tx.organizationUnit.upsert.mockImplementation(async () =>
      events.push('upsert-organization-unit'),
    );
    tx.workTimeModel.upsert.mockImplementation(async () => events.push('upsert-work-time-model'));
    tx.person.update.mockImplementation(async () => {
      events.push('update-person');
      return { id: 'person-existing' };
    });

    await service.runImport('dev-hr-token', {
      source: 'FILE',
      csv: [
        'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
        'emp01,Emp,One,emp@cueq.local,EMPLOYEE,HR,Full,39.83,7.97',
      ].join('\n'),
    });

    expect(events).toEqual([
      'import-lock',
      'find-external-id',
      'find-email',
      'person-lock',
      'find-external-id',
      'find-email',
      'upsert-organization-unit',
      'upsert-work-time-model',
      'find-external-id',
      'find-email',
      'update-person',
      'update-person',
    ]);
  });

  it('records a failed run when externalId and email resolve to different people', async () => {
    const { service, tx } = createService();
    tx.person.findUnique.mockResolvedValueOnce({ id: 'person-by-external-id' });
    tx.person.findFirst.mockResolvedValueOnce({ id: 'person-by-email' });

    const result = await service.runImport('dev-hr-token', {
      source: 'FILE',
      csv: [
        'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
        'emp01,Emp,One,emp@cueq.local,EMPLOYEE,HR,Full,39.83,7.97',
      ].join('\n'),
    });

    expect(tx.hrImportRun.create).toHaveBeenCalledWith(
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
});
