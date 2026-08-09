import { describe, expect, it } from 'vitest';
import { berlinFormatter, localMinuteInfo } from './surcharge-test-support.js';

describe('localMinuteInfo', () => {
  it('returns correct date and weekday for a known timestamp', () => {
    // 2026-03-03 is a Tuesday, 12:00 UTC = 13:00 CET
    const ts = new Date('2026-03-03T12:00:00.000Z').getTime();
    const info = localMinuteInfo(ts, berlinFormatter);
    expect(info.isoDate).toBe('2026-03-03');
    expect(info.weekday).toBe(2); // Tuesday
    expect(info.localMinuteOfDay).toBe(13 * 60); // 13:00 CET
  });

  it('handles Saturday correctly', () => {
    // 2026-03-07 is a Saturday
    const ts = new Date('2026-03-07T10:00:00.000Z').getTime();
    const info = localMinuteInfo(ts, berlinFormatter);
    expect(info.weekday).toBe(6); // Saturday
  });

  it('handles Sunday correctly', () => {
    // 2026-03-08 is a Sunday
    const ts = new Date('2026-03-08T10:00:00.000Z').getTime();
    const info = localMinuteInfo(ts, berlinFormatter);
    expect(info.weekday).toBe(0); // Sunday
  });

  it('rolls date forward for CET midnight crossing', () => {
    // 2026-03-03 23:30 UTC = 2026-03-04 00:30 CET
    const ts = new Date('2026-03-03T23:30:00.000Z').getTime();
    const info = localMinuteInfo(ts, berlinFormatter);
    expect(info.isoDate).toBe('2026-03-04');
    expect(info.localMinuteOfDay).toBe(30); // 00:30
  });

  it('normalizes hour 24 without advancing the already-local date', () => {
    const h24Formatter = {
      formatToParts: (): Intl.DateTimeFormatPart[] => [
        { type: 'weekday', value: 'Wed' },
        { type: 'month', value: '03' },
        { type: 'day', value: '04' },
        { type: 'year', value: '2026' },
        { type: 'hour', value: '24' },
        { type: 'minute', value: '30' },
      ],
    } as unknown as Intl.DateTimeFormat;

    const info = localMinuteInfo(new Date('2026-03-03T23:30:00.000Z').getTime(), h24Formatter);

    expect(info.isoDate).toBe('2026-03-04');
    expect(info.weekday).toBe(3);
    expect(info.localMinuteOfDay).toBe(30);
  });

  it('handles DST spring forward (CET->CEST)', () => {
    // 2026-03-29 is DST transition in Europe/Berlin: clocks jump from 02:00 to 03:00
    // At 01:00 UTC on 2026-03-29 = 02:00 CET, which becomes 03:00 CEST
    const ts = new Date('2026-03-29T01:00:00.000Z').getTime();
    const info = localMinuteInfo(ts, berlinFormatter);
    // After spring forward: 01:00 UTC = 03:00 CEST
    expect(info.isoDate).toBe('2026-03-29');
    expect(info.localMinuteOfDay).toBe(3 * 60); // 03:00 CEST
  });

  it('handles DST fall back (CEST->CET)', () => {
    // 2026-10-25 is DST transition in Europe/Berlin: clocks go from 03:00 back to 02:00
    // At 01:00 UTC on 2026-10-25 = 02:00 CET (after fallback)
    const ts = new Date('2026-10-25T01:00:00.000Z').getTime();
    const info = localMinuteInfo(ts, berlinFormatter);
    expect(info.isoDate).toBe('2026-10-25');
    expect(info.localMinuteOfDay).toBe(2 * 60); // 02:00 CET
  });
});
