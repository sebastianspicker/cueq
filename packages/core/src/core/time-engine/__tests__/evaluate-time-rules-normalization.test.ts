import { describe, expect, it } from 'vitest';
import { evaluateTimeRules } from '../index.js';
import { BASE_INPUT } from './evaluate-time-rules-fixtures.js';

describe('evaluateTimeRules – edge cases', () => {
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

  describe('unsorted input intervals', () => {
    it('produces correct results regardless of input order', () => {
      // Provide intervals in reverse order: function should sort by start
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

    it('counts a one-millisecond interval as one started minute', () => {
      const result = evaluateTimeRules({
        ...BASE_INPUT,
        targetHours: 0,
        intervals: [
          {
            start: '2026-03-03T10:00:59.999Z',
            end: '2026-03-03T10:01:00.000Z',
            type: 'WORK',
          },
        ],
      });

      expect(result.actualHours).toBe(0.02);
    });
  });
});
