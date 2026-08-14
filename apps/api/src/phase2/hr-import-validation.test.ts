import { Role } from '@cueq/database';
import { describe, expect, it } from 'vitest';
import { parseHrImportCsv, validateHrImportRows } from './hr-import-validation.js';

describe('HR import validation', () => {
  it('normalizes CSV defaults into reconciliation-ready rows', () => {
    const rows = parseHrImportCsv(
      'externalId,firstName,lastName,email\nemp01,Emp,One,emp@cueq.local',
    );

    expect(validateHrImportRows(rows)).toEqual({
      rows: [
        expect.objectContaining({
          externalId: 'emp01',
          role: 'EMPLOYEE',
          parsedRole: Role.EMPLOYEE,
          parsedWeeklyHours: 39.83,
          parsedDailyTargetHours: 7.97,
          organizationUnitId: 'ou_unassigned',
          workTimeModelId: 'wtm_default',
        }),
      ],
      errors: [],
    });
  });

  it('reports exact duplicate and malformed-row errors', () => {
    const result = validateHrImportRows([
      {
        externalId: 'lead01',
        firstName: 'Lead',
        lastName: 'One',
        email: 'lead@cueq.local',
        role: 'TEAM_LEAD',
        organizationUnit: 'HR',
        workTimeModel: 'Full',
        weeklyHours: '39.83',
        dailyTargetHours: '7.97',
        supervisorExternalId: 'emp01',
      },
      {
        externalId: 'emp01',
        firstName: 'Emp',
        lastName: 'One',
        email: 'EMP@cueq.local',
        role: 'EMPLOYEE',
        organizationUnit: 'HR',
        workTimeModel: 'Full',
        weeklyHours: 'bad',
        dailyTargetHours: '7.97',
        supervisorExternalId: 'lead01',
      },
      {
        externalId: 'lead01',
        firstName: 'Duplicate',
        lastName: 'Lead',
        email: 'duplicate@cueq.local',
        role: 'EMPLOYEE',
        organizationUnit: 'HR',
        workTimeModel: 'Full',
        weeklyHours: '39.83',
        dailyTargetHours: '7.97',
      },
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([
      'Invalid weeklyHours for externalId="emp01".',
      'Duplicate externalId in batch: "lead01".',
    ]);
  });

  it('detects a supervisor cycle across otherwise valid rows', () => {
    const rows = parseHrImportCsv(
      [
        'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
        'lead01,Lead,One,lead@cueq.local,TEAM_LEAD,HR,Full,39.83,7.97,emp01',
        'emp01,Emp,One,emp@cueq.local,EMPLOYEE,HR,Full,39.83,7.97,lead01',
      ].join('\n'),
    );

    expect(validateHrImportRows(rows).errors).toEqual([
      'Supervisor cycle detected for externalId="lead01".',
      'Supervisor cycle detected for externalId="emp01".',
    ]);
  });
});
