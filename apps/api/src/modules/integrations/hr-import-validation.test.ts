import { Role } from '@cueq/database';
import { describe, expect, it } from 'vitest';
import { parseHrImportCsv, validateHrImportRows } from './hr-import-validation.js';

const baseRow = {
  externalId: 'employee-1',
  firstName: 'Test',
  lastName: 'Person',
  email: 'test@example.test',
  role: Role.EMPLOYEE,
  organizationUnit: 'Test Unit',
  workTimeModel: 'Default',
  weeklyHours: '40',
  dailyTargetHours: '8',
};

describe('HR import employment date validation', () => {
  it('parses optional CSV dates and preserves omitted dates as null', () => {
    const [parsed] = parseHrImportCsv(
      'externalId,firstName,lastName,email,employmentStartDate,employmentEndDate\n' +
        'employee-1,Test,Person,test@example.test,2026-09-08,',
    );
    const result = validateHrImportRows([parsed!]);

    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      employmentStartDate: '2026-09-08',
      employmentEndDate: undefined,
      parsedEmploymentStartDate: new Date('2026-09-08T00:00:00.000Z'),
      parsedEmploymentEndDate: null,
    });
  });

  it.each(['2026-02-30', '2026-2-03', '2026-02-03T00:00:00Z'])(
    'rejects invalid or non-date-only start value %s',
    (employmentStartDate) => {
      const result = validateHrImportRows([{ ...baseRow, employmentStartDate }]);

      expect(result.rows).toEqual([]);
      expect(result.errors).toContain('Invalid employmentStartDate for externalId="employee-1".');
    },
  );

  it('rejects an end date before the inclusive start date', () => {
    const result = validateHrImportRows([
      { ...baseRow, employmentStartDate: '2026-09-08', employmentEndDate: '2026-09-07' },
    ]);

    expect(result.rows).toEqual([]);
    expect(result.errors).toContain(
      'employmentEndDate precedes employmentStartDate for externalId="employee-1".',
    );
  });
});
