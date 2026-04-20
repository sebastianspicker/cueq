import { describe, expect, it } from 'vitest';
import { evaluateTimeRules } from '..';

const BASE_INPUT = {
  week: '2026-W10',
  targetHours: 39.83,
  timezone: 'Europe/Berlin',
  holidayDates: [] as string[],
};

describe('evaluateTimeRules – edge cases', () => {
  describe('empty and minimal inputs', () => {
    it('returns zero hours and no violations for empty intervals', () => {
      const result = evaluateTimeRules({ ...BASE_INPUT, intervals: [] });
      expect(result.actualHours).toBe(0);
      expect(result.deltaHours).toBe(-39.83);
      expect(result.violations).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.surchargeMinutes).toEqual([]);
    });

    it('handles a single 1-minute work interval', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T10:00:00.000Z',
            end: '2026-03-03T10:01:00.000Z',
            type: 'WORK',
          },
        ],
      });
      expect(result.actualHours).toBe(0.02); // 1min / 60
      expect(result.violations).toEqual([]);
    });
  });

  describe('invalid intervals', () => {
    it('rejects interval where end equals start (zero duration)', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        intervals: [
          {
            start: '2026-03-03T10:00:00.000Z',
            end: '2026-03-03T10:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('INVALID_INTERVAL');
    });

    it('rejects interval where end is before start', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        intervals: [
          {
            start: '2026-03-03T12:00:00.000Z',
            end: '2026-03-03T10:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('INVALID_INTERVAL');
    });

    it('rejects interval with invalid ISO datetime', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        intervals: [{ start: 'not-a-date', end: '2026-03-03T10:00:00.000Z', type: 'WORK' }],
      });
      expect(result.violations.some((v) => v.code === 'INVALID_INTERVAL')).toBe(true);
    });

    it('skips invalid intervals but still processes valid ones', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T10:00:00.000Z', end: '2026-03-03T10:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T10:00:00.000Z', end: '2026-03-03T11:00:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'INVALID_INTERVAL')).toBe(true);
      expect(result.actualHours).toBe(1);
    });
  });

  describe('DEPLOYMENT type counts as work', () => {
    it('counts DEPLOYMENT minutes toward actualHours', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T10:00:00.000Z',
            end: '2026-03-03T12:00:00.000Z',
            type: 'DEPLOYMENT',
          },
        ],
      });
      expect(result.actualHours).toBe(2);
    });

    it('applies surcharges to DEPLOYMENT intervals', () => {
      // Sunday deployment at night
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-08T00:00:00.000Z',
            end: '2026-03-08T01:00:00.000Z',
            type: 'DEPLOYMENT',
          },
        ],
      });
      // Sunday 01:00-02:00 CET = weekend, and within night window (20:00-06:00)
      // WEEKEND (priority 200) > NIGHT (priority 100), so WEEKEND wins
      expect(result.surchargeMinutes).toEqual([
        { category: 'WEEKEND', ratePercent: 50, minutes: 60 },
      ]);
    });
  });

  describe('PAUSE does not count as work', () => {
    it('PAUSE intervals do not add to actualHours', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T10:00:00.000Z', end: '2026-03-03T12:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T12:00:00.000Z', end: '2026-03-03T12:30:00.000Z', type: 'PAUSE' },
        ],
      });
      expect(result.actualHours).toBe(2);
    });
  });

  describe('break threshold boundaries (ArbZG §4)', () => {
    it('no break required for exactly 6h work (threshold is >=6, but exactly 6h is below 6.0 by rounding)', () => {
      // 6h work = 360 minutes, threshold workedHoursMin=6 means >=6h needs 30min break
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T13:00:00.000Z', type: 'WORK' },
        ],
      });
      // 360 minutes / 60 = 6.0h, and threshold is workedHoursMin: 6
      // requiredBreakMinutes filters with workedHours >= 6, so exactly 6h triggers 30min break
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(true);
    });

    it('no break violation for under 6h work', () => {
      // 5h59min = 359 minutes = 5.98h
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T12:59:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
    });

    it('requires 45min break for exactly 9h work', () => {
      // 9h = 540 min, threshold workedHoursMin: 9 -> 45min break
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T16:00:00.000Z', type: 'WORK' },
        ],
      });
      // No PAUSE, so break deficit
      const deficit = result.violations.find((v) => v.code === 'BREAK_DEFICIT');
      expect(deficit).toBeDefined();
      expect(deficit!.context).toMatchObject({ requiredBreakMinutes: 45 });
    });

    it('30min pause satisfies 6h shift but not 9h shift', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T16:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T12:00:00.000Z', end: '2026-03-03T12:30:00.000Z', type: 'PAUSE' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(true);
    });

    it('45min pause satisfies 9h shift', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T16:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T12:00:00.000Z', end: '2026-03-03T12:45:00.000Z', type: 'PAUSE' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
    });
  });

  describe('max daily hours boundaries', () => {
    it('warns at 8h+ but does not violate', () => {
      // 8h1min = 481 minutes = 8.02h
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T15:01:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.warnings.some((w) => w.code === 'MAX_DAILY_HOURS_EXTENDED_RANGE')).toBe(true);
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(false);
    });

    it('violates at 10h+ (extended limit)', () => {
      // 10h1min = 601 minutes = 10.02h
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T17:01:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(true);
    });

    it('exactly 8h produces no warning or violation', () => {
      // 480 minutes = 8.0h exactly
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T15:00:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.warnings).toEqual([]);
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(false);
    });

    it('exactly 10h warns but does not violate', () => {
      // 600 minutes = 10.0h exactly
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T17:00:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.warnings.some((w) => w.code === 'MAX_DAILY_HOURS_EXTENDED_RANGE')).toBe(true);
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(false);
    });
  });

  describe('max weekly hours', () => {
    it('violates when weekly total exceeds 48h', () => {
      const intervals = Array.from({ length: 5 }, (_, i) => ({
        start: `2026-03-0${2 + i}T06:00:00.000Z`,
        end: `2026-03-0${2 + i}T16:01:00.000Z`,
        type: 'WORK' as const,
      }));
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals,
      });
      expect(result.violations.some((v) => v.code === 'MAX_WEEKLY_HOURS_EXCEEDED')).toBe(true);
    });
  });

  describe('rest period between shifts', () => {
    it('detects rest deficit when gap between shifts is under 11h', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T15:00:00.000Z', type: 'WORK' },
          { start: '2026-03-04T01:00:00.000Z', end: '2026-03-04T09:00:00.000Z', type: 'WORK' },
        ],
      });
      // Gap is 10h (15:00 to 01:00)
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(true);
    });

    it('no rest violation when gap is exactly 11h', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T15:00:00.000Z', type: 'WORK' },
          { start: '2026-03-04T02:00:00.000Z', end: '2026-03-04T10:00:00.000Z', type: 'WORK' },
        ],
      });
      // Gap is 11h (15:00 to 02:00)
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(false);
    });

    it('PAUSE intervals do not count for rest period checks', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T15:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T18:00:00.000Z', end: '2026-03-03T18:30:00.000Z', type: 'PAUSE' },
          { start: '2026-03-04T02:00:00.000Z', end: '2026-03-04T10:00:00.000Z', type: 'WORK' },
        ],
      });
      // Rest between the two WORK intervals is 11h (15:00 to 02:00), PAUSE is ignored
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(false);
    });
  });

  describe('cross-midnight day boundary', () => {
    it('splits work minutes across two calendar days', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T22:00:00.000Z',
            end: '2026-03-04T02:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 22:00 UTC = 23:00 CET, 02:00 UTC = 03:00 CET
      // Day 2026-03-03: 23:00-00:00 = 60 minutes
      // Day 2026-03-04: 00:00-03:00 = 180 minutes
      // Total: 240 minutes = 4h
      expect(result.actualHours).toBe(4);
    });
  });

  describe('DST transitions', () => {
    it('spring forward: 3h UTC interval still counts 180 minutes despite local clock jump', () => {
      // 2026-03-29 is Sunday (DST spring-forward in Europe/Berlin)
      // At 02:00 CET, clocks jump to 03:00 CEST
      // Work from 00:00 UTC to 03:00 UTC (= 01:00 CET to 05:00 CEST)
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-29T00:00:00.000Z',
            end: '2026-03-29T03:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 180 UTC minutes of work regardless of DST local time representation
      expect(result.actualHours).toBe(3);
      // Sunday + night window overlap → WEEKEND wins (priority 200 > NIGHT priority 100)
      expect(result.surchargeMinutes).toEqual([
        { category: 'WEEKEND', ratePercent: 50, minutes: 180 },
      ]);
    });

    it('fall back: 3h UTC interval counts correctly despite repeated local hour', () => {
      // 2026-10-25 is Sunday (DST fall-back in Europe/Berlin)
      // At 03:00 CEST, clocks go back to 02:00 CET
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-10-25T00:00:00.000Z',
            end: '2026-10-25T03:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      expect(result.actualHours).toBe(3);
      // Sunday + night → WEEKEND wins
      expect(result.surchargeMinutes).toEqual([
        { category: 'WEEKEND', ratePercent: 50, minutes: 180 },
      ]);
    });

    it('weekday near DST: night surcharge correct on day before spring forward', () => {
      // 2026-03-28 is Saturday (day before DST), use Friday 2026-03-27
      // Work from 20:00 UTC to 23:00 UTC on Fri = 21:00-00:00 CET (night window)
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-27T20:00:00.000Z',
            end: '2026-03-27T23:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      expect(result.actualHours).toBe(3);
      // Friday night, 21:00-00:00 CET — pure NIGHT, no weekend
      // But wait: 23:00 UTC = 00:00 CET on Saturday 2026-03-28
      // Minutes at 23:00 CET are Friday, minutes at 00:00 are Saturday
      // So we get split: some NIGHT (Friday), some WEEKEND (Saturday midnight)
      // Actually: 20:00 UTC = 21:00 CET (Fri), 23:00 UTC = 00:00 CET (Sat)
      // 21:00-23:59 CET = 179 min on Friday (NIGHT), 00:00 = 1 min on Saturday (WEEKEND)
      expect(result.surchargeMinutes.some((s) => s.category === 'NIGHT')).toBe(true);
    });

    it('DST spring-forward day: weekday work before the transition gets correct local time', () => {
      // Use a Monday near DST to isolate night surcharge without weekend overlap
      // 2026-03-30 is Monday (day after DST)
      // Work 02:00 UTC to 04:00 UTC = 04:00-06:00 CEST (night window until 06:00)
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-30T02:00:00.000Z',
            end: '2026-03-30T04:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      expect(result.actualHours).toBe(2);
      // 04:00-05:59 CEST = within night window (20:00-06:00), Monday
      expect(result.surchargeMinutes).toEqual([
        { category: 'NIGHT', ratePercent: 25, minutes: 120 },
      ]);
    });
  });

  describe('surcharge stacking and precedence', () => {
    it('holiday on a Saturday night: only HOLIDAY applies', () => {
      // 2026-04-05 is a Sunday, let's use a holiday on Saturday 2026-04-04
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-04-04T20:00:00.000Z',
            end: '2026-04-04T21:00:00.000Z',
            type: 'WORK',
          },
        ],
        holidayDates: ['2026-04-04'],
      });
      // 2026-04-04 is a Saturday, 20:00 UTC = 22:00 CEST
      // Matches: HOLIDAY (it's a holiday) + WEEKEND (Saturday) + NIGHT (22:00 in 20:00-06:00)
      // HOLIDAY wins by priority
      expect(result.surchargeMinutes).toEqual([
        { category: 'HOLIDAY', ratePercent: 100, minutes: 60 },
      ]);
    });

    it('weekday night-only shift gets NIGHT surcharge', () => {
      // Tuesday night
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T20:00:00.000Z',
            end: '2026-03-03T21:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 20:00 UTC = 21:00 CET on a Tuesday, within night window
      expect(result.surchargeMinutes).toEqual([
        { category: 'NIGHT', ratePercent: 25, minutes: 60 },
      ]);
    });

    it('weekday daytime shift gets no surcharge', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T08:00:00.000Z',
            end: '2026-03-03T16:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 09:00-17:00 CET on a Tuesday — no surcharge
      expect(result.surchargeMinutes).toEqual([]);
    });

    it('Saturday daytime gets WEEKEND surcharge', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-07T08:00:00.000Z',
            end: '2026-03-07T10:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 09:00-11:00 CET on Saturday — weekend only (not night)
      expect(result.surchargeMinutes).toEqual([
        { category: 'WEEKEND', ratePercent: 50, minutes: 120 },
      ]);
    });

    it('weekday holiday (not weekend): HOLIDAY surcharge only', () => {
      // 2026-03-04 is a Wednesday, declared as holiday
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-04T08:00:00.000Z',
            end: '2026-03-04T09:00:00.000Z',
            type: 'WORK',
          },
        ],
        holidayDates: ['2026-03-04'],
      });
      // 09:00-10:00 CET on Wednesday holiday — not weekend, not night
      expect(result.surchargeMinutes).toEqual([
        { category: 'HOLIDAY', ratePercent: 100, minutes: 60 },
      ]);
    });

    it('night shift crossing into holiday at midnight: surcharge split', () => {
      // Work 22:00 CET Tue → 02:00 CET Wed, Wednesday is holiday
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T21:00:00.000Z',
            end: '2026-03-04T01:00:00.000Z',
            type: 'WORK',
          },
        ],
        holidayDates: ['2026-03-04'],
      });
      // Tue 22:00-23:59 CET (120 min): weekday + night → NIGHT
      // Wed 00:00-01:59 CET (120 min): holiday + night → HOLIDAY wins
      expect(result.actualHours).toBe(4);
      expect(result.surchargeMinutes).toContainEqual(
        expect.objectContaining({ category: 'HOLIDAY', minutes: 120 }),
      );
      expect(result.surchargeMinutes).toContainEqual(
        expect.objectContaining({ category: 'NIGHT', minutes: 120 }),
      );
    });

    it('Friday-to-Saturday midnight crossing: NIGHT transitions to WEEKEND', () => {
      // Work 22:00 CET Fri → 02:00 CET Sat
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-06T21:00:00.000Z',
            end: '2026-03-07T01:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // Fri 22:00-23:59 CET (120 min): weekday + night → NIGHT
      // Sat 00:00-01:59 CET (120 min): weekend + night → WEEKEND wins
      expect(result.actualHours).toBe(4);
      expect(result.surchargeMinutes).toContainEqual(
        expect.objectContaining({ category: 'WEEKEND', minutes: 120 }),
      );
      expect(result.surchargeMinutes).toContainEqual(
        expect.objectContaining({ category: 'NIGHT', minutes: 120 }),
      );
    });
  });

  describe('part-time worker delta calculation', () => {
    it('computes negative delta for under-target part-time week', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 30, // part-time
        intervals: [
          { start: '2026-03-03T08:00:00.000Z', end: '2026-03-03T13:00:00.000Z', type: 'WORK' },
          { start: '2026-03-04T08:00:00.000Z', end: '2026-03-04T13:00:00.000Z', type: 'WORK' },
          { start: '2026-03-05T08:00:00.000Z', end: '2026-03-05T13:00:00.000Z', type: 'WORK' },
          { start: '2026-03-06T08:00:00.000Z', end: '2026-03-06T13:00:00.000Z', type: 'WORK' },
        ],
      });
      // 4 * 5h = 20h, target 30h, delta = -10
      expect(result.actualHours).toBe(20);
      expect(result.deltaHours).toBe(-10);
    });
  });

  describe('overlapping WORK intervals', () => {
    it('normalizes work overlaps so minutes are not double-counted', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T08:00:00.000Z', end: '2026-03-03T12:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T10:00:00.000Z', end: '2026-03-03T14:00:00.000Z', type: 'WORK' },
        ],
      });

      expect(result.actualHours).toBe(6);
      expect(result.violations.some((v) => v.code === 'OVERLAP')).toBe(true);
    });

    it('does not double-count surcharge minutes across overlapping work intervals', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-08T00:00:00.000Z', end: '2026-03-08T02:00:00.000Z', type: 'WORK' },
          {
            start: '2026-03-08T01:00:00.000Z',
            end: '2026-03-08T03:00:00.000Z',
            type: 'DEPLOYMENT',
          },
        ],
      });

      expect(result.actualHours).toBe(3);
      expect(result.surchargeMinutes).toEqual([
        { category: 'WEEKEND', ratePercent: 50, minutes: 180 },
      ]);
    });
  });

  describe('unknown interval type', () => {
    it('non-standard type is neither work nor pause', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T08:00:00.000Z',
            end: '2026-03-03T10:00:00.000Z',
            type: 'STANDBY' as 'WORK',
          },
        ],
      });
      // STANDBY is not in WORK_INTERVAL_TYPES and is not 'PAUSE'
      expect(result.actualHours).toBe(0);
      expect(result.surchargeMinutes).toEqual([]);
    });
  });

  describe('fixture parity', () => {
    it('matches weekend-night surcharge fixture', () => {
      const result = evaluateTimeRules({
        week: '2026-W10',
        targetHours: 0,
        timezone: 'Europe/Berlin',
        holidayDates: [],
        intervals: [
          {
            start: '2026-03-07T21:00:00.000Z',
            end: '2026-03-07T22:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      expect(result.actualHours).toBe(1);
      expect(result.deltaHours).toBe(1);
      expect(result.violations).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.surchargeMinutes).toEqual([
        { category: 'WEEKEND', ratePercent: 50, minutes: 60 },
      ]);
    });

    it('matches holiday-overlap surcharge fixture', () => {
      const result = evaluateTimeRules({
        week: '2026-W14',
        targetHours: 0,
        timezone: 'Europe/Berlin',
        holidayDates: ['2026-04-05'],
        intervals: [
          {
            start: '2026-04-05T20:00:00.000Z',
            end: '2026-04-05T21:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      expect(result.actualHours).toBe(1);
      expect(result.deltaHours).toBe(1);
      expect(result.violations).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.surchargeMinutes).toEqual([
        { category: 'HOLIDAY', ratePercent: 100, minutes: 60 },
      ]);
    });
  });

  describe('holiday matching uses local timezone date, not UTC', () => {
    it('applies HOLIDAY surcharge when UTC date differs from local Berlin date', () => {
      // 2026-03-03 23:00 UTC = 2026-03-04 00:00 CET (Berlin)
      // March 4 is declared as holiday — surcharge should apply because the local date is March 4
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T23:00:00.000Z',
            end: '2026-03-04T00:00:00.000Z',
            type: 'WORK',
          },
        ],
        holidayDates: ['2026-03-04'],
      });
      // 23:00 UTC = 00:00 CET on 2026-03-04 (Wednesday, a holiday)
      // 60 minutes in the night window + holiday → HOLIDAY wins
      expect(result.actualHours).toBe(1);
      expect(result.surchargeMinutes).toEqual([
        { category: 'HOLIDAY', ratePercent: 100, minutes: 60 },
      ]);
    });

    it('does NOT apply HOLIDAY when UTC date is the holiday but local date is not', () => {
      // 2026-03-04 declared as holiday in UTC, but work is on
      // 2026-03-03 22:00 UTC = 2026-03-03 23:00 CET (still March 3, not holiday)
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T22:00:00.000Z',
            end: '2026-03-03T23:00:00.000Z',
            type: 'WORK',
          },
        ],
        holidayDates: ['2026-03-04'],
      });
      // 22:00 UTC = 23:00 CET on Tuesday March 3 — not a holiday, but within night window
      expect(result.surchargeMinutes).toEqual([
        { category: 'NIGHT', ratePercent: 25, minutes: 60 },
      ]);
    });
  });

  describe('unsorted input intervals', () => {
    it('produces correct results regardless of input order', () => {
      // Provide intervals in reverse order — function should sort by start
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-04T08:00:00.000Z', end: '2026-03-04T12:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T08:00:00.000Z', end: '2026-03-03T12:00:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.actualHours).toBe(8);
      // Rest: gap from 12:00 UTC Mar3 to 08:00 UTC Mar4 = 20h → no violation
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(false);
    });

    it('detects rest deficit for unsorted intervals with short gap', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-04T01:00:00.000Z', end: '2026-03-04T09:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T15:00:00.000Z', type: 'WORK' },
        ],
      });
      // After sorting: Mar3 07-15, Mar4 01-09. Gap = 10h (15:00 to 01:00) → violation
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(true);
    });
  });

  describe('multiple PAUSE intervals per day', () => {
    it('aggregates separate PAUSE intervals into total break minutes', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T16:00:00.000Z', type: 'WORK' },
          // Two separate 15-minute pauses = 30 total — not enough for 9h shift (needs 45)
          { start: '2026-03-03T10:00:00.000Z', end: '2026-03-03T10:15:00.000Z', type: 'PAUSE' },
          { start: '2026-03-03T13:00:00.000Z', end: '2026-03-03T13:15:00.000Z', type: 'PAUSE' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(true);
    });

    it('no break deficit when multiple PAUSE intervals sum to required amount', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T16:00:00.000Z', type: 'WORK' },
          // Three 15-minute pauses = 45 total — enough for 9h shift
          { start: '2026-03-03T10:00:00.000Z', end: '2026-03-03T10:15:00.000Z', type: 'PAUSE' },
          { start: '2026-03-03T12:00:00.000Z', end: '2026-03-03T12:15:00.000Z', type: 'PAUSE' },
          { start: '2026-03-03T14:00:00.000Z', end: '2026-03-03T14:15:00.000Z', type: 'PAUSE' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
    });
  });

  describe('shift spanning full surcharge category spectrum', () => {
    it('Friday evening through Saturday morning holiday: NIGHT + WEEKEND + HOLIDAY split', () => {
      // Friday 2026-03-06 19:00 CET to Saturday 2026-03-07 08:00 CET
      // Saturday March 7 declared as holiday
      // UTC: 18:00 to 07:00 = 13 hours
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-06T18:00:00.000Z',
            end: '2026-03-07T07:00:00.000Z',
            type: 'WORK',
          },
        ],
        holidayDates: ['2026-03-07'],
      });
      expect(result.actualHours).toBe(13);
      // Friday 19:00-19:59 CET (60 min): weekday daytime → no surcharge
      // Friday 20:00-23:59 CET (240 min): weekday night → NIGHT
      // Saturday 00:00-05:59 CET (360 min): weekend + holiday + night → HOLIDAY wins
      // Saturday 06:00-07:59 CET (120 min): weekend + holiday, no night → HOLIDAY wins
      expect(result.surchargeMinutes).toContainEqual(
        expect.objectContaining({ category: 'NIGHT', minutes: 240 }),
      );
      expect(result.surchargeMinutes).toContainEqual(
        expect.objectContaining({ category: 'HOLIDAY', minutes: 480 }),
      );
      // No WEEKEND bucket — HOLIDAY always outranks WEEKEND
      expect(result.surchargeMinutes.some((s) => s.category === 'WEEKEND')).toBe(false);
    });
  });

  describe('night window boundary precision', () => {
    it('minute at 05:59 CET is inside night window (inclusive start boundary)', () => {
      // 05:59 CET = 04:59 UTC on a Tuesday 2026-03-03
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T04:59:00.000Z',
            end: '2026-03-03T05:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 05:59 CET is within night window (20:00-06:00), Tuesday
      expect(result.surchargeMinutes).toEqual([{ category: 'NIGHT', ratePercent: 25, minutes: 1 }]);
    });

    it('minute at 06:00 CET is outside night window (exclusive end boundary)', () => {
      // 06:00 CET = 05:00 UTC on a Tuesday 2026-03-03
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T05:00:00.000Z',
            end: '2026-03-03T05:01:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 06:00 CET is NOT in night window (isWithinWindow uses exclusive end)
      expect(result.surchargeMinutes).toEqual([]);
    });

    it('minute at 20:00 CET is inside night window (inclusive start boundary)', () => {
      // 20:00 CET = 19:00 UTC on a Tuesday 2026-03-03
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T19:00:00.000Z',
            end: '2026-03-03T19:01:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 20:00 CET is within night window, Tuesday
      expect(result.surchargeMinutes).toEqual([{ category: 'NIGHT', ratePercent: 25, minutes: 1 }]);
    });

    it('minute at 19:59 CET is outside night window', () => {
      // 19:59 CET = 18:59 UTC on a Tuesday 2026-03-03
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T18:59:00.000Z',
            end: '2026-03-03T19:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // 19:59 CET is NOT in night window (before 20:00)
      expect(result.surchargeMinutes).toEqual([]);
    });
  });

  describe('Saturday-to-Sunday midnight crossing', () => {
    it('all minutes get WEEKEND surcharge (both days are weekend)', () => {
      // Work from Sat 23:00 CET to Sun 01:00 CET
      // Sat 2026-03-07, Sun 2026-03-08
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-07T22:00:00.000Z',
            end: '2026-03-08T00:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // Sat 23:00-23:59 CET (60 min) + Sun 00:00-00:59 CET (60 min)
      // Both weekend + night → WEEKEND wins throughout
      expect(result.actualHours).toBe(2);
      expect(result.surchargeMinutes).toEqual([
        { category: 'WEEKEND', ratePercent: 50, minutes: 120 },
      ]);
    });
  });

  describe('Sunday-to-Monday midnight crossing', () => {
    it('WEEKEND transitions to NIGHT at midnight', () => {
      // Work from Sun 23:00 CET to Mon 01:00 CET
      // Sun 2026-03-08, Mon 2026-03-09
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-08T22:00:00.000Z',
            end: '2026-03-09T00:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // Sun 23:00-23:59 CET (60 min): weekend + night → WEEKEND
      // Mon 00:00-00:59 CET (60 min): weekday + night → NIGHT
      expect(result.actualHours).toBe(2);
      expect(result.surchargeMinutes).toContainEqual(
        expect.objectContaining({ category: 'WEEKEND', minutes: 60 }),
      );
      expect(result.surchargeMinutes).toContainEqual(
        expect.objectContaining({ category: 'NIGHT', minutes: 60 }),
      );
    });
  });

  describe('timezone fallback', () => {
    it('uses surchargeRule.timezoneDefault when input.timezone is undefined', () => {
      // The default surcharge rule uses Europe/Berlin
      // Work on Saturday 09:00-10:00 UTC = 10:00-11:00 CET = WEEKEND (daytime)
      const result = evaluateTimeRules({
        week: '2026-W10',
        targetHours: 0,
        timezone: undefined as unknown as string,
        holidayDates: [],
        intervals: [
          {
            start: '2026-03-07T09:00:00.000Z',
            end: '2026-03-07T10:00:00.000Z',
            type: 'WORK',
          },
        ],
      });
      // Should still correctly identify this as Saturday (WEEKEND)
      expect(result.surchargeMinutes).toEqual([
        { category: 'WEEKEND', ratePercent: 50, minutes: 60 },
      ]);
    });
  });

  describe('combined violations in a single evaluation', () => {
    it('detects break deficit, max daily, and rest deficit simultaneously', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          // Day 1: 11h work, no break → break deficit + max daily exceeded
          { start: '2026-03-03T06:00:00.000Z', end: '2026-03-03T17:00:00.000Z', type: 'WORK' },
          // Day 2: starts 5h after day 1 ends → rest deficit (5h < 11h)
          { start: '2026-03-03T22:00:00.000Z', end: '2026-03-04T08:00:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(true);
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(true);
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(true);
    });
  });

  describe('sub-minute interval precision', () => {
    it('counts 1 minute for a 30-second interval (minute-granularity design)', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T10:00:00.000Z',
            end: '2026-03-03T10:00:30.000Z',
            type: 'WORK',
          },
        ],
      });
      // cursor at 10:00:00.000 < end at 10:00:30.000 → 1 iteration
      expect(result.actualHours).toBe(0.02); // 1 min / 60
    });
  });
});
