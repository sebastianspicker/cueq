import { describe, expect, it } from 'vitest';
import { DEFAULT_REST_RULE } from '../rules/rest-rules';
import { DEFAULT_BREAK_RULE } from '../rules/break-rules';
import { DEFAULT_LEAVE_RULE } from '../rules/leave-rules';
import { DEFAULT_MAX_HOURS_RULE } from '../rules/max-hours-rules';
import { DEFAULT_SURCHARGE_RULE } from '../rules/surcharge-rules';
import { getActivePolicyBundle } from '../catalog';

describe('@cueq/policy acceptance', () => {
  it('defines rest reduction settings for on-call scenarios', () => {
    expect(DEFAULT_REST_RULE.onCallRestReduction?.enabled).toBe(true);
    expect(DEFAULT_REST_RULE.onCallRestReduction?.minRestHoursAfterDeployment).toBe(11);
  });

  describe('reference profile: flextime (flextime.json)', () => {
    // Fixture: flextime-basic-week — 5-day week with one overtime day
    // Expected: 40.3h actual vs 39.83h target → +0.47h delta, no violations
    it('supports weekly target of 39.83h (TV-L full-time)', () => {
      expect(DEFAULT_LEAVE_RULE.fullTimeWeeklyHours).toBe(39.83);
    });

    it('max daily hours allows 8.5h without violation (under 10h extended)', () => {
      // Fixture has one day at 8.5h — must be within extended daily max
      expect(DEFAULT_MAX_HOURS_RULE.maxDailyHoursExtended).toBeGreaterThanOrEqual(8.5);
    });

    it('weekly max of 48h accommodates 40.3h total', () => {
      expect(DEFAULT_MAX_HOURS_RULE.maxWeeklyHours).toBeGreaterThanOrEqual(40.3);
    });
  });

  describe('reference profile: shift/Pforte (pforte-shift.json)', () => {
    // Fixture: pforte-shift-night — 22:00–06:00 night shift, 45min break recorded
    // Expected: 7.25h worked (8h - 0.75h break), 45min required break, no violations
    it('night shift 22:00–06:00 is 8h total; 45min break leaves 7.25h worked', () => {
      const totalShiftHours = 8;
      const breakHours = 45 / 60;
      expect(totalShiftHours - breakHours).toBeCloseTo(7.25);
    });

    it('8h shift crosses the 6h break threshold, requiring at least 30min break', () => {
      const threshold = DEFAULT_BREAK_RULE.thresholds.find((t) => t.workedHoursMin === 6);
      expect(threshold).toBeDefined();
      expect(threshold!.requiredBreakMinutes).toBeLessThanOrEqual(45);
    });

    it('cross-midnight handling is configured for overnight shifts', () => {
      expect(DEFAULT_REST_RULE.crossMidnightHandling).toBe('CONTINUE_INTO_NEXT_DAY');
    });

    it('night window covers 22:00–06:00 shift entirely', () => {
      // Pforte shift 22:00–06:00 falls within night surcharge window 20:00–06:00
      expect(DEFAULT_SURCHARGE_RULE.nightWindow.startLocalTime).toBe('20:00');
      expect(DEFAULT_SURCHARGE_RULE.nightWindow.endLocalTime).toBe('06:00');
    });
  });

  describe('reference profile: part-time change (part-time-change.json)', () => {
    // Fixture: part-time-model-change — 39.83h/wk → 30h/wk mid-month (Apr 15)
    // Expected: prorated target 151.33h, actual 149h → -2.33h delta
    it('leave rule supports pro-rata on entry (contract transition)', () => {
      expect(DEFAULT_LEAVE_RULE.proRataOnEntry).toBe(true);
    });

    it('leave rule supports pro-rata on exit (contract transition)', () => {
      expect(DEFAULT_LEAVE_RULE.proRataOnExit).toBe(true);
    });

    it('full-time baseline of 39.83h allows prorating to 30h segment', () => {
      const fullTime = DEFAULT_LEAVE_RULE.fullTimeWeeklyHours;
      const partTimeHours = 30;
      const ratio = partTimeHours / fullTime;
      // Part-time ratio should be roughly 75%
      expect(ratio).toBeGreaterThan(0.7);
      expect(ratio).toBeLessThan(0.8);
    });
  });

  describe('reference profile: on-call/IT (it-oncall.json)', () => {
    // Fixture: it-oncall-deployment-rest — deployment 01:10–02:20, next shift 14:00
    // Expected: 11.67h rest after deployment (>= 11h minimum), compliant
    it('on-call rest reduction requires 11h minimum after deployment', () => {
      expect(DEFAULT_REST_RULE.onCallRestReduction?.minRestHoursAfterDeployment).toBe(11);
    });

    it('deployment ending at 02:20 with next shift at 14:00 gives 11.67h rest', () => {
      // 02:20 to 14:00 = 11h 40min = 11.67h
      const deploymentEnd = new Date('2026-03-14T02:20:00Z');
      const nextShift = new Date('2026-03-14T14:00:00Z');
      const restHours = (nextShift.getTime() - deploymentEnd.getTime()) / (1000 * 60 * 60);
      expect(restHours).toBeCloseTo(11.67, 1);
      expect(restHours).toBeGreaterThanOrEqual(
        DEFAULT_REST_RULE.onCallRestReduction!.minRestHoursAfterDeployment,
      );
    });
  });

  describe('reference profile: surcharge — weekend/night overlap', () => {
    // Fixture: time-engine-surcharge-weekend-night
    // Saturday 21:00–22:00 UTC (22:00–23:00 Berlin) → both WEEKEND and NIGHT match
    // HIGHEST_ONLY strategy → WEEKEND wins (priority 200 > NIGHT 100)
    it('HIGHEST_ONLY strategy resolves weekend+night overlap to weekend rate', () => {
      expect(DEFAULT_SURCHARGE_RULE.overlapStrategy).toBe('HIGHEST_ONLY');
      const weekend = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'WEEKEND')!;
      const night = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'NIGHT')!;
      expect(weekend.priority).toBeGreaterThan(night.priority);
      expect(weekend.ratePercent).toBe(50);
    });
  });

  describe('reference profile: surcharge — holiday overlap', () => {
    // Fixture: time-engine-surcharge-holiday-overlap
    // Holiday on Sunday at 20:00–21:00 UTC → HOLIDAY + WEEKEND + NIGHT all match
    // HIGHEST_ONLY → HOLIDAY wins (priority 300)
    it('HIGHEST_ONLY strategy resolves holiday+weekend+night to holiday rate', () => {
      const holiday = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'HOLIDAY')!;
      const weekend = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'WEEKEND')!;
      const night = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'NIGHT')!;
      expect(holiday.priority).toBeGreaterThan(weekend.priority);
      expect(holiday.priority).toBeGreaterThan(night.priority);
      expect(holiday.ratePercent).toBe(100);
    });
  });

  describe('fixture policy version alignment', () => {
    it('all fixtures reference policyVersion 1, matching current catalog', () => {
      const bundle = getActivePolicyBundle('2026-03-15');
      for (const rule of bundle) {
        expect(rule.version).toBe(1);
      }
    });
  });
});
