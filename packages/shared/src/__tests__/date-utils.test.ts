import { describe, expect, it } from 'vitest';
import { parseDateOnly, parseIsoDateTime } from '../date-utils';

describe('strict shared date parsing', () => {
  it('accepts valid calendar dates including leap day', () => {
    expect(parseDateOnly('2028-02-29').toISOString()).toBe('2028-02-29T00:00:00.000Z');
  });

  it.each(['2026-02-30', '2026-04-31', '2026-13-01', '2026-01-1'])(
    'rejects impossible or non-canonical date %s',
    (input) => {
      expect(() => parseDateOnly(input)).toThrow('Invalid date');
    },
  );

  it('rejects normalized calendar dates inside ISO datetimes', () => {
    expect(() => parseIsoDateTime('2026-02-30T10:15:00.000Z')).toThrow('Invalid date');
  });

  it('accepts canonical ISO datetimes with a UTC offset', () => {
    expect(parseIsoDateTime('2026-03-01T10:15:00+01:00').toISOString()).toBe(
      '2026-03-01T09:15:00.000Z',
    );
  });
});
