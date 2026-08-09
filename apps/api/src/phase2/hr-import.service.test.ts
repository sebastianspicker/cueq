import { describe, expect, it } from 'vitest';
import { createService } from './hr-import-test-support.js';

describe('HrImportService', () => {
  it('imports valid CSV rows and links supervisors from the same batch', async () => {
    const { service, prisma, tx, auditHelper } = createService();
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
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.organizationUnit.upsert).toHaveBeenCalledTimes(2);
    expect(tx.workTimeModel.upsert).toHaveBeenCalledTimes(2);
    expect(tx.person.create).toHaveBeenCalledTimes(2);
    expect(tx.person.update).toHaveBeenCalledWith({
      where: { id: 'person-employee' },
      data: { supervisorId: 'person-lead' },
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      totalRows: 2,
      createdRows: 2,
      updatedRows: 0,
      errorCount: 0,
    });
  });
});
