import { afterAll, describe, expect, it } from 'vitest';
import { isoInstantToLocalDateTimeInput, localDateTimeInputToIsoInstant } from './datetime-local';

const originalTimeZone = process.env.TZ;

describe('datetime-local conversion', () => {
  afterAll(() => {
    process.env.TZ = originalTimeZone;
  });

  it.each(['UTC', 'America/New_York'])(
    'uses Berlin wall-clock time when the host timezone is %s',
    (hostTimeZone) => {
      process.env.TZ = hostTimeZone;

      expect(isoInstantToLocalDateTimeInput('2026-03-01T00:00:00.000Z')).toBe('2026-03-01T01:00');
      expect(isoInstantToLocalDateTimeInput('2026-07-01T00:00:00.000Z')).toBe('2026-07-01T02:00');
      expect(localDateTimeInputToIsoInstant('2026-03-01T01:00')).toBe('2026-03-01T00:00:00.000Z');
      expect(localDateTimeInputToIsoInstant('2026-07-01T02:00')).toBe('2026-07-01T00:00:00.000Z');
    },
  );

  it('rejects nonexistent Berlin times and resolves repeated times to the earlier instant', () => {
    expect(localDateTimeInputToIsoInstant('2026-03-29T02:30')).toBeNull();
    expect(localDateTimeInputToIsoInstant('2026-10-25T02:30')).toBe('2026-10-25T00:30:00.000Z');
  });

  it('handles cleared and invalid controls without throwing', () => {
    expect(localDateTimeInputToIsoInstant('')).toBeNull();
    expect(localDateTimeInputToIsoInstant('not-a-date')).toBeNull();
    expect(localDateTimeInputToIsoInstant('2026-02-30T12:00')).toBeNull();
    expect(isoInstantToLocalDateTimeInput('not-a-date')).toBe('');
  });
});
