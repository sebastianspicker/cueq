import { describe, expect, it } from 'vitest';
// @ts-expect-error JavaScript tooling has no declaration file.
import { parseCsv, validateRows } from '../scripts/hr-import/validation.mjs';

describe('CLI HR import employment dates', () => {
  it('parses valid date-only fields into UTC dates', () => {
    const rows = parseCsv(
      'externalId,firstName,lastName,email,employmentStartDate,employmentEndDate\n' +
        'employee-1,Test,Person,test@example.test,2026-09-08,2026-09-08',
    );
    const result = validateRows(rows);

    expect(result.errors).toEqual([]);
    expect(result.validatedRows[0]).toMatchObject({
      employmentStartDate: '2026-09-08',
      employmentEndDate: '2026-09-08',
      parsedEmploymentStartDate: new Date('2026-09-08T00:00:00.000Z'),
      parsedEmploymentEndDate: new Date('2026-09-08T00:00:00.000Z'),
    });
  });

  it('rejects impossible dates and reversed ranges', () => {
    const invalid = validateRows([
      {
        externalId: 'employee-1',
        firstName: 'Test',
        lastName: 'Person',
        email: 'test@example.test',
        role: 'EMPLOYEE',
        organizationUnit: 'Test',
        workTimeModel: 'Default',
        weeklyHours: '40',
        dailyTargetHours: '8',
        employmentStartDate: '2026-02-30',
      },
    ]);
    const reversed = validateRows([
      {
        externalId: 'employee-2',
        firstName: 'Test',
        lastName: 'Person',
        email: 'test2@example.test',
        role: 'EMPLOYEE',
        organizationUnit: 'Test',
        workTimeModel: 'Default',
        weeklyHours: '40',
        dailyTargetHours: '8',
        employmentStartDate: '2026-09-08',
        employmentEndDate: '2026-09-07',
      },
    ]);

    expect(invalid.validatedRows).toEqual([]);
    expect(invalid.errors[0]).toContain('Invalid employmentStartDate');
    expect(reversed.validatedRows).toEqual([]);
    expect(reversed.errors[0]).toContain('precedes employmentStartDate');
  });
});
