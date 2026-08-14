import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { reconcileHrImportRows } from './hr-import-reconciliation.helper.js';
import type { ValidatedHrImportRow } from './hr-import-validation.js';

function row(overrides: Partial<ValidatedHrImportRow>): ValidatedHrImportRow {
  return {
    externalId: 'employee-1',
    firstName: 'Employee',
    lastName: 'One',
    email: 'employee-1@cueq.local',
    role: 'EMPLOYEE',
    organizationUnit: 'Operations',
    workTimeModel: 'Standard',
    weeklyHours: '39.83',
    dailyTargetHours: '7.97',
    parsedRole: Role.EMPLOYEE,
    parsedWeeklyHours: 39.83,
    parsedDailyTargetHours: 7.97,
    organizationUnitId: 'ou_operations',
    workTimeModelId: 'wtm_standard',
    ...overrides,
  };
}

describe('reconcileHrImportRows', () => {
  it('uses one identity query while preserving mixed writes and supervisor resolution', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      organizationUnit: { upsert: vi.fn().mockResolvedValue({}) },
      workTimeModel: { upsert: vi.fn().mockResolvedValue({}) },
      person: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'person-existing',
            externalId: 'existing-1',
            email: 'existing-1@cueq.local',
          },
          { id: 'person-boss', externalId: 'boss-1', email: 'boss-1@cueq.local' },
        ]),
        create: vi.fn(async ({ data }) => ({ id: `person-${data.externalId}` })),
        update: vi.fn(async ({ where }) => ({ id: where.id })),
      },
    };
    const rows = [
      row({
        externalId: 'existing-1',
        email: 'existing-1@cueq.local',
        supervisorExternalId: 'boss-1',
      }),
      row({ supervisorExternalId: 'lead-1' }),
      row({
        externalId: 'lead-1',
        firstName: 'Lead',
        lastName: 'One',
        email: 'lead-1@cueq.local',
        role: 'TEAM_LEAD',
        parsedRole: Role.TEAM_LEAD,
      }),
    ];

    const result = await reconcileHrImportRows(tx as never, rows);

    expect(result).toMatchObject({ createdRows: 2, updatedRows: 1 });
    expect(tx.person.findMany).toHaveBeenCalledTimes(1);
    expect(tx.person.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            externalId: {
              in: expect.arrayContaining(['existing-1', 'employee-1', 'lead-1', 'boss-1']),
            },
          },
          {
            email: {
              in: expect.arrayContaining([
                'existing-1@cueq.local',
                'employee-1@cueq.local',
                'lead-1@cueq.local',
              ]),
              mode: 'insensitive',
            },
          },
        ],
      },
      select: { id: true, externalId: true, email: true },
    });
    expect(tx.organizationUnit.upsert).toHaveBeenCalledTimes(1);
    expect(tx.workTimeModel.upsert).toHaveBeenCalledTimes(1);
    expect(tx.person.create).toHaveBeenCalledTimes(2);
    expect(tx.person.update).toHaveBeenCalledWith({
      where: { id: 'person-existing' },
      data: { supervisorId: 'person-boss' },
    });
    expect(tx.person.update).toHaveBeenCalledWith({
      where: { id: 'person-employee-1' },
      data: { supervisorId: 'person-lead-1' },
    });
  });

  it('preserves the externalId/email conflict message without writing', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      organizationUnit: { upsert: vi.fn() },
      workTimeModel: { upsert: vi.fn() },
      person: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'person-external', externalId: 'employee-1', email: 'other@cueq.local' },
          { id: 'person-email', externalId: 'other', email: 'employee-1@cueq.local' },
        ]),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    await expect(reconcileHrImportRows(tx as never, [row({})])).rejects.toThrow(
      'HR identity conflict for externalId="employee-1" and email="employee-1@cueq.local".',
    );
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.organizationUnit.upsert).not.toHaveBeenCalled();
    expect(tx.workTimeModel.upsert).not.toHaveBeenCalled();
    expect(tx.person.create).not.toHaveBeenCalled();
    expect(tx.person.update).not.toHaveBeenCalled();
  });
});
