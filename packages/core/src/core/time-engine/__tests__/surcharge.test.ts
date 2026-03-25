import { describe, expect, it } from 'vitest';
import {
  isWithinWindow,
  isWorkIntervalType,
  localMinuteInfo,
  parseLocalTimeToMinute,
  selectSurchargeCategory,
} from '../surcharge';
import type { SurchargeCategory } from '@cueq/policy';

describe('parseLocalTimeToMinute', () => {
  it('parses standard HH:MM times', () => {
    expect(parseLocalTimeToMinute('00:00')).toBe(0);
    expect(parseLocalTimeToMinute('06:00')).toBe(360);
    expect(parseLocalTimeToMinute('20:00')).toBe(1200);
    expect(parseLocalTimeToMinute('23:59')).toBe(1439);
  });

  it('returns 0 for invalid inputs', () => {
    expect(parseLocalTimeToMinute('')).toBe(0);
    expect(parseLocalTimeToMinute('25:00')).toBe(0);
    expect(parseLocalTimeToMinute('12:60')).toBe(0);
    expect(parseLocalTimeToMinute('ab:cd')).toBe(0);
    expect(parseLocalTimeToMinute('-1:00')).toBe(0);
    expect(parseLocalTimeToMinute('12')).toBe(0);
  });
});

describe('isWithinWindow', () => {
  // Night window: 20:00 (1200) -> 06:00 (360) — crosses midnight
  const nightStart = 1200; // 20:00
  const nightEnd = 360; // 06:00

  it('identifies minutes within cross-midnight window', () => {
    expect(isWithinWindow(1200, nightStart, nightEnd)).toBe(true); // exactly 20:00
    expect(isWithinWindow(1320, nightStart, nightEnd)).toBe(true); // 22:00
    expect(isWithinWindow(0, nightStart, nightEnd)).toBe(true); // 00:00 (after midnight)
    expect(isWithinWindow(300, nightStart, nightEnd)).toBe(true); // 05:00
  });

  it('excludes minutes outside cross-midnight window', () => {
    expect(isWithinWindow(360, nightStart, nightEnd)).toBe(false); // exactly 06:00 (exclusive end)
    expect(isWithinWindow(720, nightStart, nightEnd)).toBe(false); // 12:00
    expect(isWithinWindow(1199, nightStart, nightEnd)).toBe(false); // 19:59
  });

  it('handles non-crossing window (e.g. 08:00-17:00)', () => {
    const start = 480; // 08:00
    const end = 1020; // 17:00
    expect(isWithinWindow(480, start, end)).toBe(true); // exactly 08:00
    expect(isWithinWindow(720, start, end)).toBe(true); // 12:00
    expect(isWithinWindow(1019, start, end)).toBe(true); // 16:59
    expect(isWithinWindow(1020, start, end)).toBe(false); // exactly 17:00 (exclusive)
    expect(isWithinWindow(479, start, end)).toBe(false); // 07:59
  });

  it('returns true for all minutes when start === end (full 24h window)', () => {
    expect(isWithinWindow(0, 720, 720)).toBe(true);
    expect(isWithinWindow(720, 720, 720)).toBe(true);
    expect(isWithinWindow(1439, 720, 720)).toBe(true);
  });
});

describe('localMinuteInfo', () => {
  const berlinFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

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

describe('isWorkIntervalType', () => {
  it('classifies WORK and DEPLOYMENT as work', () => {
    expect(isWorkIntervalType('WORK')).toBe(true);
    expect(isWorkIntervalType('DEPLOYMENT')).toBe(true);
  });

  it('does not classify PAUSE or unknown types as work', () => {
    expect(isWorkIntervalType('PAUSE')).toBe(false);
    expect(isWorkIntervalType('BREAK')).toBe(false);
    expect(isWorkIntervalType('')).toBe(false);
  });
});

describe('selectSurchargeCategory', () => {
  const configByCategory = new Map<SurchargeCategory, { priority: number }>([
    ['NIGHT', { priority: 100 }],
    ['WEEKEND', { priority: 200 }],
    ['HOLIDAY', { priority: 300 }],
  ]);

  it('returns null for empty categories', () => {
    expect(selectSurchargeCategory([], configByCategory)).toBeNull();
  });

  it('returns the single category when only one matches', () => {
    expect(selectSurchargeCategory(['NIGHT'], configByCategory)).toBe('NIGHT');
    expect(selectSurchargeCategory(['WEEKEND'], configByCategory)).toBe('WEEKEND');
    expect(selectSurchargeCategory(['HOLIDAY'], configByCategory)).toBe('HOLIDAY');
  });

  it('selects highest priority: HOLIDAY > WEEKEND > NIGHT', () => {
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND'], configByCategory)).toBe('WEEKEND');
    expect(selectSurchargeCategory(['NIGHT', 'HOLIDAY'], configByCategory)).toBe('HOLIDAY');
    expect(selectSurchargeCategory(['WEEKEND', 'HOLIDAY'], configByCategory)).toBe('HOLIDAY');
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND', 'HOLIDAY'], configByCategory)).toBe(
      'HOLIDAY',
    );
  });

  it('uses tie-break when priorities are equal', () => {
    const equalPriority = new Map<SurchargeCategory, { priority: number }>([
      ['NIGHT', { priority: 100 }],
      ['WEEKEND', { priority: 100 }],
      ['HOLIDAY', { priority: 100 }],
    ]);
    // Tie-break: HOLIDAY(3) > WEEKEND(2) > NIGHT(1)
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND'], equalPriority)).toBe('WEEKEND');
    expect(selectSurchargeCategory(['NIGHT', 'HOLIDAY'], equalPriority)).toBe('HOLIDAY');
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND', 'HOLIDAY'], equalPriority)).toBe('HOLIDAY');
  });

  it('handles category not found in config (defaults to priority 0)', () => {
    // Config only has HOLIDAY, but input includes NIGHT and WEEKEND
    const partialConfig = new Map<SurchargeCategory, { priority: number }>([
      ['HOLIDAY', { priority: 300 }],
    ]);
    // HOLIDAY has priority 300, others default to 0 → HOLIDAY wins
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND', 'HOLIDAY'], partialConfig)).toBe('HOLIDAY');
    // When only unconfigured categories: WEEKEND(tiebreak=2) > NIGHT(tiebreak=1)
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND'], partialConfig)).toBe('WEEKEND');
  });

  it('respects custom config where NIGHT has higher priority than WEEKEND', () => {
    const reversedConfig = new Map<SurchargeCategory, { priority: number }>([
      ['NIGHT', { priority: 300 }],
      ['WEEKEND', { priority: 200 }],
      ['HOLIDAY', { priority: 100 }],
    ]);
    // NIGHT now has highest priority, overriding default tie-break order
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND'], reversedConfig)).toBe('NIGHT');
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND', 'HOLIDAY'], reversedConfig)).toBe('NIGHT');
    expect(selectSurchargeCategory(['WEEKEND', 'HOLIDAY'], reversedConfig)).toBe('WEEKEND');
  });

  it('handles single-element array (no sorting needed)', () => {
    const emptyConfig = new Map<SurchargeCategory, { priority: number }>();
    // Even without config, single category is returned directly
    expect(selectSurchargeCategory(['NIGHT'], emptyConfig)).toBe('NIGHT');
  });
});
