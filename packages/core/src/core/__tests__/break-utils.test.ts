import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_RULE } from '@cueq/policy';
import type { BreakRule } from '@cueq/policy';
import { requiredBreakMinutes } from '../break-utils';

describe('requiredBreakMinutes', () => {
  // DEFAULT_BREAK_RULE thresholds:
  //   workedHoursMin: 6 → requiredBreakMinutes: 30
  //   workedHoursMin: 9 → requiredBreakMinutes: 45

  describe('default break rule thresholds', () => {
    it('returns 0 when worked hours are below all thresholds', () => {
      expect(requiredBreakMinutes(5.99, DEFAULT_BREAK_RULE)).toBe(0);
    });

    it('returns 0 for zero worked hours', () => {
      expect(requiredBreakMinutes(0, DEFAULT_BREAK_RULE)).toBe(0);
    });

    it('returns 30 at exactly 6 worked hours', () => {
      expect(requiredBreakMinutes(6, DEFAULT_BREAK_RULE)).toBe(30);
    });

    it('returns 30 between 6 and 9 hours', () => {
      expect(requiredBreakMinutes(7, DEFAULT_BREAK_RULE)).toBe(30);
      expect(requiredBreakMinutes(8, DEFAULT_BREAK_RULE)).toBe(30);
      expect(requiredBreakMinutes(8.99, DEFAULT_BREAK_RULE)).toBe(30);
    });

    it('returns 45 at exactly 9 worked hours', () => {
      expect(requiredBreakMinutes(9, DEFAULT_BREAK_RULE)).toBe(45);
    });

    it('returns 45 above 9 hours', () => {
      expect(requiredBreakMinutes(10, DEFAULT_BREAK_RULE)).toBe(45);
      expect(requiredBreakMinutes(12, DEFAULT_BREAK_RULE)).toBe(45);
    });
  });

  describe('night shift minimum', () => {
    it('applies NIGHT_SHIFT_MIN_BREAK_MINUTES (45) for NIGHT shifts', () => {
      // Below 6h: normal = 0, but night shift min = 45
      expect(requiredBreakMinutes(4, DEFAULT_BREAK_RULE, 'NIGHT')).toBe(45);
    });

    it('applies night shift minimum case-insensitively', () => {
      expect(requiredBreakMinutes(4, DEFAULT_BREAK_RULE, 'night')).toBe(45);
      expect(requiredBreakMinutes(4, DEFAULT_BREAK_RULE, 'Night')).toBe(45);
    });

    it('returns threshold-based break when it exceeds night shift minimum', () => {
      // At 9h, threshold = 45, night min = 45 → max(45, 45) = 45
      expect(requiredBreakMinutes(9, DEFAULT_BREAK_RULE, 'NIGHT')).toBe(45);
    });

    it('does not apply night shift minimum for non-NIGHT shift types', () => {
      expect(requiredBreakMinutes(4, DEFAULT_BREAK_RULE, 'EARLY')).toBe(0);
      expect(requiredBreakMinutes(4, DEFAULT_BREAK_RULE, 'LATE')).toBe(0);
      expect(requiredBreakMinutes(4, DEFAULT_BREAK_RULE, 'DAY')).toBe(0);
    });

    it('does not apply night shift minimum when shiftType is undefined', () => {
      expect(requiredBreakMinutes(4, DEFAULT_BREAK_RULE)).toBe(0);
    });
  });

  describe('custom break rules', () => {
    it('handles a single-threshold rule', () => {
      const rule: BreakRule = {
        ...DEFAULT_BREAK_RULE,
        id: 'custom-single',
        thresholds: [{ workedHoursMin: 4, requiredBreakMinutes: 20 }],
      };
      expect(requiredBreakMinutes(3.99, rule)).toBe(0);
      expect(requiredBreakMinutes(4, rule)).toBe(20);
      expect(requiredBreakMinutes(10, rule)).toBe(20);
    });

    it('handles an empty threshold list', () => {
      const rule: BreakRule = {
        ...DEFAULT_BREAK_RULE,
        id: 'custom-empty',
        thresholds: [],
      };
      expect(requiredBreakMinutes(8, rule)).toBe(0);
    });

    it('selects the maximum break from multiple matching thresholds', () => {
      const rule: BreakRule = {
        ...DEFAULT_BREAK_RULE,
        id: 'custom-three',
        thresholds: [
          { workedHoursMin: 4, requiredBreakMinutes: 15 },
          { workedHoursMin: 6, requiredBreakMinutes: 30 },
          { workedHoursMin: 9, requiredBreakMinutes: 60 },
        ],
      };
      // At 10h, all three thresholds match → max(15, 30, 60) = 60
      expect(requiredBreakMinutes(10, rule)).toBe(60);
      // At 7h, first two match → max(15, 30) = 30
      expect(requiredBreakMinutes(7, rule)).toBe(30);
      // At 5h, only first matches
      expect(requiredBreakMinutes(5, rule)).toBe(15);
    });
  });
});
