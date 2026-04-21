import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_HOURS_RULE } from '@cueq/policy';
import { calculateFlextimeWeek } from '..';

const BASE_INPUT = {
  week: '2026-W10',
  targetHours: 39.83,
  bookings: [] as Array<{ day: string; workedHours: number; breakMinutes?: number }>,
};

describe('calculateFlextimeWeek – edge cases', () => {
  describe('empty and minimal inputs', () => {
    it('returns zero hours and full negative delta for empty bookings', () => {
      const result = calculateFlextimeWeek({ ...BASE_INPUT });
      expect(result.actualHours).toBe(0);
      expect(result.deltaHours).toBe(-39.83);
      expect(result.violations).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.plausibilityIssues).toEqual([]);
    });

    it('handles a single short booking with no break needed', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 4 }],
      });
      expect(result.actualHours).toBe(4);
      expect(result.violations).toEqual([]);
    });
  });

  describe('break thresholds', () => {
    it('no break deficit when workedHours exactly 6 and breakMinutes omitted', () => {
      // When breakMinutes is omitted, the fallback `breakMinutes ?? expectedBreak` means
      // it defaults to expectedBreak, so no violation.
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 6 }],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
    });

    it('break deficit when workedHours 6 and breakMinutes explicitly 0', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 6, breakMinutes: 0 }],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(true);
    });

    it('no break deficit when workedHours 5.99 and breakMinutes 0', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 5.99, breakMinutes: 0 }],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
    });

    it('requires 45min break for exactly 9h', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 9, breakMinutes: 30 }],
      });
      const deficit = result.violations.find((v) => v.code === 'BREAK_DEFICIT');
      expect(deficit).toBeDefined();
      expect(deficit!.context).toMatchObject({ requiredBreakMinutes: 45 });
    });

    it('no break deficit for 9h with 45min break', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 9, breakMinutes: 45 }],
      });
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
    });

    it('no break deficit when breakMinutes exactly meets 6h threshold (30min)', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 6, breakMinutes: 30 }],
      });
      // 30 < 30 = false → no deficit
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(false);
    });

    it('break deficit when breakMinutes is 1 under 6h threshold (29min)', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 6, breakMinutes: 29 }],
      });
      // 29 < 30 = true → deficit
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(true);
    });

    it('break deficit when breakMinutes is 1 under 9h threshold (44min)', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 9, breakMinutes: 44 }],
      });
      // 44 < 45 = true → deficit
      expect(result.violations.some((v) => v.code === 'BREAK_DEFICIT')).toBe(true);
    });
  });

  describe('max daily hours boundaries', () => {
    it('exactly 8h: no warning, no violation', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 8 }],
      });
      expect(result.warnings).toEqual([]);
      expect(result.violations.filter((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toEqual([]);
    });

    it('8.01h: warning only, no violation', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 8.01 }],
      });
      expect(result.warnings.some((w) => w.code === 'MAX_DAILY_HOURS_EXTENDED_RANGE')).toBe(true);
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(false);
    });

    it('exactly 10h: warning only, no violation', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 10 }],
      });
      expect(result.warnings.some((w) => w.code === 'MAX_DAILY_HOURS_EXTENDED_RANGE')).toBe(true);
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(false);
    });

    it('10.01h: violation', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 10.01 }],
      });
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(true);
    });
  });

  describe('max weekly hours', () => {
    it('exactly 48h: no violation', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 0,
        bookings: [
          { day: '2026-03-02', workedHours: 9.6 },
          { day: '2026-03-03', workedHours: 9.6 },
          { day: '2026-03-04', workedHours: 9.6 },
          { day: '2026-03-05', workedHours: 9.6 },
          { day: '2026-03-06', workedHours: 9.6 },
        ],
      });
      expect(result.actualHours).toBe(48);
      expect(result.violations.some((v) => v.code === 'MAX_WEEKLY_HOURS_EXCEEDED')).toBe(false);
    });

    it('48.01h: violation', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 0,
        bookings: [
          { day: '2026-03-02', workedHours: 9.6 },
          { day: '2026-03-03', workedHours: 9.6 },
          { day: '2026-03-04', workedHours: 9.6 },
          { day: '2026-03-05', workedHours: 9.6 },
          { day: '2026-03-06', workedHours: 9.61 },
        ],
      });
      expect(result.violations.some((v) => v.code === 'MAX_WEEKLY_HOURS_EXCEEDED')).toBe(true);
    });
  });

  describe('rest period checks', () => {
    it('no rest violations when dailyRestHours is not provided', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 8 }],
      });
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(false);
    });

    it('detects multiple rest deficits', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [
          { day: '2026-03-02', workedHours: 8 },
          { day: '2026-03-03', workedHours: 8 },
          { day: '2026-03-04', workedHours: 8 },
        ],
        dailyRestHours: [10, 9, 12],
      });
      const restViolations = result.violations.filter((v) => v.code === 'REST_HOURS_DEFICIT');
      expect(restViolations).toHaveLength(2); // first two are < 11h
    });

    it('exactly 11h rest: no violation', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 8 }],
        dailyRestHours: [11],
      });
      expect(result.violations.some((v) => v.code === 'REST_HOURS_DEFICIT')).toBe(false);
    });
  });

  describe('part-time worker', () => {
    it('positive delta for part-time worker who worked more than target', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 20, // part-time 50%
        bookings: [
          { day: '2026-03-02', workedHours: 6 },
          { day: '2026-03-03', workedHours: 6 },
          { day: '2026-03-04', workedHours: 6 },
          { day: '2026-03-05', workedHours: 6 },
        ],
      });
      expect(result.actualHours).toBe(24);
      expect(result.deltaHours).toBe(4);
    });

    it('negative delta for part-time under-hours', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 20,
        bookings: [
          { day: '2026-03-02', workedHours: 4 },
          { day: '2026-03-03', workedHours: 4 },
        ],
      });
      expect(result.actualHours).toBe(8);
      expect(result.deltaHours).toBe(-12);
    });
  });

  describe('zero and negative workedHours', () => {
    it('zero workedHours booking produces no violations', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 0,
        bookings: [{ day: '2026-03-02', workedHours: 0 }],
      });
      expect(result.actualHours).toBe(0);
      expect(result.violations).toEqual([]);
    });

    it('negative workedHours reduces total (no explicit validation)', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 0,
        bookings: [
          { day: '2026-03-02', workedHours: 8 },
          { day: '2026-03-03', workedHours: -2 },
        ],
      });
      expect(result.actualHours).toBe(6);
    });
  });

  describe('plausibility delegation', () => {
    it('returns empty plausibilityIssues when no bookingIntervals provided', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 8 }],
      });
      expect(result.plausibilityIssues).toEqual([]);
    });

    it('returns plausibility issues for empty bookingIntervals array', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 8 }],
        bookingIntervals: [],
      });
      expect(result.plausibilityIssues).toEqual([]);
    });
  });

  describe('custom policy override', () => {
    it('uses custom max daily hours from policy', () => {
      const result = calculateFlextimeWeek(
        {
          ...BASE_INPUT,
          bookings: [{ day: '2026-03-02', workedHours: 7 }],
        },
        {
          maxHoursRule: {
            ...DEFAULT_MAX_HOURS_RULE,
            maxDailyHours: 6,
            maxDailyHoursExtended: 8,
          },
        },
      );
      // 7h exceeds custom max of 6h but not extended 8h → warning, no violation
      expect(result.warnings.some((w) => w.code === 'MAX_DAILY_HOURS_EXTENDED_RANGE')).toBe(true);
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(false);
    });
  });

  describe('fixture parity', () => {
    it('matches flextime basic week fixture', () => {
      const result = calculateFlextimeWeek({
        week: '2026-W10',
        targetHours: 39.83,
        bookings: [
          { day: '2026-03-02', workedHours: 8.0 },
          { day: '2026-03-03', workedHours: 8.5 },
          { day: '2026-03-04', workedHours: 7.8 },
          { day: '2026-03-05', workedHours: 8.0 },
          { day: '2026-03-06', workedHours: 8.0 },
        ],
      });
      expect(result.actualHours).toBe(40.3);
      expect(result.deltaHours).toBe(0.47);
      expect(result.violations).toEqual([]);
    });
  });

  describe('multiple bookings on same day', () => {
    it('sums workedHours from separate bookings on the same day', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 0,
        bookings: [
          { day: '2026-03-02', workedHours: 4 },
          { day: '2026-03-02', workedHours: 4 },
        ],
      });
      // Both bookings contribute to total
      expect(result.actualHours).toBe(8);
    });

    it('checks max daily hours per booking, not per day aggregate', () => {
      // Each booking is 6h (under daily max of 8h), but total is 12h
      // The function checks per-booking, so no daily max violation per booking
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 0,
        bookings: [
          { day: '2026-03-02', workedHours: 6 },
          { day: '2026-03-02', workedHours: 6 },
        ],
      });
      // Each 6h booking is under 8h → no warning per booking
      expect(result.violations.some((v) => v.code === 'MAX_DAILY_HOURS_EXCEEDED')).toBe(false);
    });
  });

  describe('exact target match', () => {
    it('delta is exactly zero when actualHours equals targetHours', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        targetHours: 40,
        bookings: [
          { day: '2026-03-02', workedHours: 8 },
          { day: '2026-03-03', workedHours: 8 },
          { day: '2026-03-04', workedHours: 8 },
          { day: '2026-03-05', workedHours: 8 },
          { day: '2026-03-06', workedHours: 8 },
        ],
      });
      expect(result.actualHours).toBe(40);
      expect(result.deltaHours).toBe(0);
    });
  });

  describe('plausibility integration with overlapping bookingIntervals', () => {
    it('returns overlap issues from bookingIntervals while computing flextime normally', () => {
      const result = calculateFlextimeWeek({
        ...BASE_INPUT,
        bookings: [{ day: '2026-03-02', workedHours: 8 }],
        bookingIntervals: [
          { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
          { start: '2026-03-02T11:00:00.000Z', end: '2026-03-02T16:00:00.000Z' },
        ],
      });
      expect(result.plausibilityIssues.some((i) => i.code === 'OVERLAP')).toBe(true);
      // Flextime calculation still works despite plausibility issues
      expect(result.actualHours).toBe(8);
    });
  });
});
