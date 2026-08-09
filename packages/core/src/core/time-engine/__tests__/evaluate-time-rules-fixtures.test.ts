import { describe, expect, it } from 'vitest';
import { evaluateTimeRules } from '../index.js';

describe('evaluateTimeRules – edge cases', () => {
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
});
