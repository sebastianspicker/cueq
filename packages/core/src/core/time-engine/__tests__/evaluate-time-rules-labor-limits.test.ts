import { describe, expect, it } from 'vitest';
import { evaluateTimeRules } from '../index.js';
import { BASE_INPUT } from './evaluate-time-rules-fixtures.js';

describe('evaluateTimeRules – edge cases', () => {
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

    it('does not double-count duplicate or overlapping pauses', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T16:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T12:00:00.000Z', end: '2026-03-03T12:30:00.000Z', type: 'PAUSE' },
          { start: '2026-03-03T12:00:00.000Z', end: '2026-03-03T12:30:00.000Z', type: 'PAUSE' },
        ],
      });

      expect(result.violations).toContainEqual(
        expect.objectContaining({
          code: 'BREAK_DEFICIT',
          context: expect.objectContaining({ breakMinutes: 30, requiredBreakMinutes: 45 }),
        }),
      );
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
    it('treats split work intervals on one local workday as one period', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T12:00:00.000Z', type: 'WORK' },
          { start: '2026-03-03T13:00:00.000Z', end: '2026-03-03T16:00:00.000Z', type: 'WORK' },
        ],
      });

      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(false);
    });

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

    it('uses instant order when same-day interval ends have different fractional precision', () => {
      const laterEnd = '2026-03-03T15:00:00.001Z';
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00Z', end: '2026-03-03T15:00:00Z', type: 'WORK' },
          { start: '2026-03-03T14:30:00Z', end: laterEnd, type: 'WORK' },
          { start: '2026-03-04T01:00:00Z', end: '2026-03-04T09:00:00Z', type: 'WORK' },
        ],
      });

      expect(result.violations).toContainEqual(
        expect.objectContaining({
          code: 'REST_HOURS_DEFICIT',
          context: expect.objectContaining({ previousEnd: laterEnd }),
        }),
      );
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

  describe('multiple PAUSE intervals per day', () => {
    it('aggregates separate PAUSE intervals into total break minutes', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          { start: '2026-03-03T07:00:00.000Z', end: '2026-03-03T16:00:00.000Z', type: 'WORK' },
          // Two separate 15-minute pauses = 30 total: not enough for 9h shift (needs 45)
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
          // Three 15-minute pauses = 45 total: enough for 9h shift
          { start: '2026-03-03T10:00:00.000Z', end: '2026-03-03T10:15:00.000Z', type: 'PAUSE' },
          { start: '2026-03-03T12:00:00.000Z', end: '2026-03-03T12:15:00.000Z', type: 'PAUSE' },
          { start: '2026-03-03T14:00:00.000Z', end: '2026-03-03T14:15:00.000Z', type: 'PAUSE' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
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
          // Next local workday starts 9h after day 1 ends → rest deficit (9h < 11h)
          { start: '2026-03-04T02:00:00.000Z', end: '2026-03-04T12:00:00.000Z', type: 'WORK' },
        ],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(true);
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(true);
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(true);
    });
  });
});
