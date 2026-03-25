import { describe, expect, it } from 'vitest';
import { parseCsvRecords } from './parse-csv';

describe('parseCsvRecords', () => {
  it('parses quoted commas and escaped quotes', () => {
    const csv = [
      'personId,timeTypeCode,startTime,note',
      'p1,WORK,2026-03-11T08:00:00.000Z,"first, second"',
      'p2,WORK,2026-03-11T09:00:00.000Z,"said ""hello"""',
    ].join('\n');

    const parsed = parseCsvRecords(csv);
    expect(parsed.headers).toEqual(['personId', 'timeTypeCode', 'startTime', 'note']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.note).toBe('first, second');
    expect(parsed.rows[1]?.note).toBe('said "hello"');
  });

  it('parses BOM-prefixed files and quoted newlines', () => {
    const csv = [
      '\ufeffexternalId,firstName,lastName,email,note',
      'e1,Ina,Import,ina.import@cueq.local,"line1',
      'line2"',
    ].join('\n');

    const parsed = parseCsvRecords(csv);
    expect(parsed.headers[0]).toBe('externalId');
    expect(parsed.rows[0]?.note).toBe('line1\nline2');
  });

  it('throws for unmatched quotes', () => {
    const csv = [
      'personId,timeTypeCode,startTime,note',
      'p1,WORK,2026-03-11T08:00:00.000Z,"oops',
    ].join('\n');

    expect(() => parseCsvRecords(csv)).toThrow(/unmatched quote/iu);
  });

  it('throws for duplicate header names', () => {
    const csv = ['personId,personId,startTime', 'p1,p2,2026-03-11T08:00:00.000Z'].join('\n');

    expect(() => parseCsvRecords(csv)).toThrow(/duplicate header names/iu);
  });

  it('throws for empty header names', () => {
    const csv = ['personId,,startTime', 'p1,WORK,2026-03-11T08:00:00.000Z'].join('\n');

    expect(() => parseCsvRecords(csv)).toThrow(/header names must be non-empty/iu);
  });
});
