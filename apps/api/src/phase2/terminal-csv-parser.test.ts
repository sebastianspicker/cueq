import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseHoneywellCsv } from './terminal-csv-parser.js';

const PERSON_ID = 'cm0000000000000000000001';

describe('parseHoneywellCsv', () => {
  it('retains valid rows and reports malformed rows without importing them', () => {
    const result = parseHoneywellCsv(
      [
        'personId,timeTypeCode,startTime,endTime,note',
        `${PERSON_ID},WORK,2026-07-14T08:00:00.000Z,2026-07-14T12:00:00.000Z,normal`,
        `${PERSON_ID},WORK,not-a-date,,,`,
      ].join('\n'),
    );

    expect(result).toEqual({
      records: [
        {
          personId: PERSON_ID,
          timeTypeCode: 'WORK',
          startTime: '2026-07-14T08:00:00.000Z',
          endTime: '2026-07-14T12:00:00.000Z',
          note: 'normal',
        },
      ],
      rawRows: 2,
      validRows: 1,
      malformedRows: 1,
    });
  });

  it('preserves the required-header error contract', () => {
    expect(() =>
      parseHoneywellCsv(`personId,startTime\n${PERSON_ID},2026-07-14T08:00:00.000Z`),
    ).toThrow(new BadRequestException('Missing required Honeywell CSV column: timeTypeCode'));
  });

  it('wraps CSV parser errors with the established Honeywell message', () => {
    expect(() => parseHoneywellCsv('personId,timeTypeCode,startTime\n"unterminated')).toThrow(
      'Invalid Honeywell CSV payload: CSV parse error: unmatched quote in input.',
    );
  });
});
