import { describe, expect, it } from 'vitest';
import { createService } from './hr-import-test-support.js';

describe('HrImportService', () => {
  it('rejects pre-acceptance validation failures without creating a run', async () => {
    const { service, prisma } = createService();

    await expect(
      service.runImport('dev-hr-token', {
        source: 'FILE',
        csv: [
          'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
          'emp01,Emp,One,,EMPLOYEE,HR,Full,39.83,7.97',
        ].join('\n'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HR_IMPORT_VALIDATION_FAILED' }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns a retryable conflict without creating a run when the advisory lock is held', async () => {
    const { service, tx } = createService();
    tx.$queryRaw.mockResolvedValueOnce([{ acquired: false }]);

    await expect(
      service.runImport('dev-hr-token', {
        source: 'FILE',
        csv: [
          'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
          'emp01,Emp,One,emp@cueq.local,EMPLOYEE,HR,Full,39.83,7.97',
        ].join('\n'),
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'HR_IMPORT_IN_PROGRESS',
        message: 'Another HR import is already in progress.',
        retryable: true,
      },
    });

    expect(tx.hrImportRun.create).not.toHaveBeenCalled();
    expect(tx.person.create).not.toHaveBeenCalled();
  });

  it('rejects supervisor cycles before opening a transaction', async () => {
    const { service, prisma } = createService();

    await expect(
      service.runImport('dev-hr-token', {
        source: 'FILE',
        csv: [
          'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
          'emp01,Emp,One,one@cueq.local,EMPLOYEE,HR,Full,39.83,7.97,emp02',
          'emp02,Emp,Two,two@cueq.local,EMPLOYEE,HR,Full,39.83,7.97,emp01',
        ].join('\n'),
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HR_IMPORT_VALIDATION_FAILED' }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
