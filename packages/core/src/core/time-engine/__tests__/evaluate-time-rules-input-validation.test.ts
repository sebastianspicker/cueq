import { describe, expect, it } from 'vitest';
import { DEFAULT_SURCHARGE_RULE } from '@cueq/policy';
import { evaluateTimeRules } from '../index.js';
import { BASE_INPUT } from './evaluate-time-rules-fixtures.js';

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
    it('reports invalid surcharge night windows without applying all-day night surcharge', () => {
      const result = evaluateTimeRules(
        {
          ...BASE_INPUT,
          targetHours: 0,
          intervals: [
            {
              start: '2026-03-03T10:00:00.000Z',
              end: '2026-03-03T11:00:00.000Z',
              type: 'WORK',
            },
          ],
        },
        {
          surchargeRule: {
            ...DEFAULT_SURCHARGE_RULE,
            nightWindow: {
              startLocalTime: '99:99',
              endLocalTime: 'ab:cd',
            },
          },
        },
      );

      expect(result.violations).toContainEqual(
        expect.objectContaining({ code: 'INVALID_SURCHARGE_NIGHT_WINDOW' }),
      );
      expect(result.surchargeMinutes).toEqual([]);
    });

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

  describe('timezone validation boundary', () => {
    it('rejects an invalid IANA timezone before evaluating intervals', () => {
      expect(() =>
        evaluateTimeRules({
          ...BASE_INPUT,
          timezone: 'Europe/Not-A-Zone',
          intervals: [],
        }),
      ).toThrow(RangeError);
    });
  });
});
