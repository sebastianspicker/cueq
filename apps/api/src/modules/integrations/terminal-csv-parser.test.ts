import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseHoneywellCsv } from './terminal-csv-parser.js';

describe('Honeywell terminal CSV protocol', () => {
  it('retains valid records, reports malformed rows, and rejects an incomplete protocol header', () => {
    const csv = [
      'personId,timeTypeCode,startTime,endTime,note',
      'c123456789012345678901234,WORK,2026-08-04T08:00:00.000Z,2026-08-04T10:00:00.000Z,arrival',
      'not-a-cuid,WORK,2026-08-04T10:00:00.000Z,2026-08-04T09:00:00.000Z,invalid',
    ].join('\n');

    expect(parseHoneywellCsv(csv)).toMatchObject({
      rawRows: 2,
      validRows: 1,
      malformedRows: 1,
      records: [{ personId: 'c123456789012345678901234', note: 'arrival' }],
    });
    expect(() =>
      parseHoneywellCsv('personId,startTime\nc123456789012345678901234,2026-08-04T08:00:00.000Z'),
    ).toThrow(BadRequestException);
  });
});
