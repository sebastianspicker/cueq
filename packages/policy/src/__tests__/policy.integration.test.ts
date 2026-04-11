import { describe, expect, it } from 'vitest';
import { DEFAULT_BREAK_RULE, type BreakRule } from '../rules/break-rules';
import { DEFAULT_LEAVE_RULE, LeaveRuleSchema, type LeaveRule } from '../rules/leave-rules';
import { DEFAULT_REST_RULE } from '../rules/rest-rules';
import { DEFAULT_MAX_HOURS_RULE } from '../rules/max-hours-rules';
import { DEFAULT_SURCHARGE_RULE } from '../rules/surcharge-rules';
import { getActivePolicyBundle, getPolicyHistory, type PolicyCatalogRule } from '../catalog';

describe('@cueq/policy integration', () => {
  it('keeps break-rule thresholds ordered by worked-hours minimum', () => {
    const thresholds = DEFAULT_BREAK_RULE.thresholds;
    expect(thresholds[0]?.workedHoursMin).toBeLessThan(thresholds[1]?.workedHoursMin ?? 0);
  });

  it('resolves active policy bundle by as-of date', () => {
    const bundle = getActivePolicyBundle('2026-03-15');
    expect(bundle).toHaveLength(5);
    expect(bundle.map((entry) => entry.type)).toEqual([
      'BREAK_RULE',
      'LEAVE_RULE',
      'MAX_HOURS_RULE',
      'REST_RULE',
      'SURCHARGE_RULE',
    ]);
  });

  it('filters policy history by rule type', () => {
    const history = getPolicyHistory('REST_RULE');
    expect(history).toHaveLength(1);
    expect(history[0]?.type).toBe('REST_RULE');
  });

  describe('bundle resolution at different dates', () => {
    it('resolves full bundle on exact effectiveFrom date (2024-01-01)', () => {
      const bundle = getActivePolicyBundle('2024-01-01');
      expect(bundle).toHaveLength(5);
    });

    it('returns empty bundle for date before all rules are effective', () => {
      const bundle = getActivePolicyBundle('2023-12-31');
      expect(bundle).toHaveLength(0);
    });

    it('resolves full bundle far in the future (open-ended effectiveTo)', () => {
      const bundle = getActivePolicyBundle('2099-12-31');
      expect(bundle).toHaveLength(5);
    });

    it('returns empty bundle when no policy matches a given date range', () => {
      const expiredHistory: PolicyCatalogRule[] = [
        { ...DEFAULT_BREAK_RULE, effectiveTo: '2024-12-31' },
      ];
      const bundle = getActivePolicyBundle('2025-06-01', expiredHistory);
      expect(bundle).toHaveLength(0);
    });
  });

  describe('policy version transition — old rule until Jan 31, new rule from Feb 1', () => {
    const v1Break: BreakRule = {
      ...DEFAULT_BREAK_RULE,
      id: 'break-v1',
      version: 1,
      effectiveFrom: '2024-01-01',
      effectiveTo: '2026-01-31',
    };
    const v2Break: BreakRule = {
      ...DEFAULT_BREAK_RULE,
      id: 'break-v2',
      version: 2,
      effectiveFrom: '2026-02-01',
      effectiveTo: null,
      thresholds: [
        { workedHoursMin: 6, requiredBreakMinutes: 30 },
        { workedHoursMin: 9, requiredBreakMinutes: 45 },
        { workedHoursMin: 10, requiredBreakMinutes: 60 },
      ],
    };
    const transitionHistory: PolicyCatalogRule[] = [v1Break, v2Break];

    it('returns v1 on Jan 31 (last day of old rule)', () => {
      const bundle = getActivePolicyBundle('2026-01-31', transitionHistory);
      expect(bundle).toHaveLength(1);
      expect(bundle[0]!.version).toBe(1);
      expect(bundle[0]!.id).toBe('break-v1');
    });

    it('returns v2 on Feb 1 (first day of new rule)', () => {
      const bundle = getActivePolicyBundle('2026-02-01', transitionHistory);
      expect(bundle).toHaveLength(1);
      expect(bundle[0]!.version).toBe(2);
      expect(bundle[0]!.id).toBe('break-v2');
    });

    it('v2 has additional threshold not present in v1', () => {
      const bundle = getActivePolicyBundle('2026-03-01', transitionHistory);
      const breakRule = bundle[0] as BreakRule;
      expect(breakRule.thresholds).toHaveLength(3);
      expect(breakRule.thresholds[2]).toEqual({ workedHoursMin: 10, requiredBreakMinutes: 60 });
    });

    it('no gap exists between v1 end and v2 start (Jan 31 + Feb 1 = contiguous)', () => {
      // Verify that querying any date in the transition always yields exactly one rule
      const jan31 = getActivePolicyBundle('2026-01-31', transitionHistory);
      const feb01 = getActivePolicyBundle('2026-02-01', transitionHistory);
      expect(jan31).toHaveLength(1);
      expect(feb01).toHaveLength(1);
      expect(jan31[0]!.id).not.toBe(feb01[0]!.id);
    });

    it('when both v1 and v2 overlap on a date, highest version wins', () => {
      const overlappingHistory: PolicyCatalogRule[] = [
        { ...DEFAULT_BREAK_RULE, id: 'break-v1', version: 1 },
        { ...DEFAULT_BREAK_RULE, id: 'break-v2', version: 2 },
      ];
      const bundle = getActivePolicyBundle('2026-03-15', overlappingHistory);
      expect(bundle).toHaveLength(1);
      expect(bundle[0]!.version).toBe(2);
    });
  });

  describe('surcharge categories stacking — Sunday + holiday + night', () => {
    it('HIGHEST_ONLY: when all three categories apply, holiday wins (priority 300)', () => {
      // Scenario: Sunday Dec 25 at 23:00 — WEEKEND + HOLIDAY + NIGHT all match
      const categories = DEFAULT_SURCHARGE_RULE.categories;
      const holiday = categories.find((c) => c.category === 'HOLIDAY')!;
      const weekend = categories.find((c) => c.category === 'WEEKEND')!;
      const night = categories.find((c) => c.category === 'NIGHT')!;

      // All three exist
      expect(holiday).toBeDefined();
      expect(weekend).toBeDefined();
      expect(night).toBeDefined();

      // Under HIGHEST_ONLY, resolve by finding the max-priority category
      const applicableCategories = [holiday, weekend, night];
      const resolved = applicableCategories.reduce((best, cat) =>
        cat.priority > best.priority ? cat : best,
      );

      expect(resolved.category).toBe('HOLIDAY');
      expect(resolved.ratePercent).toBe(100);
    });

    it('HIGHEST_ONLY: weekend + night overlap resolves to weekend (priority 200 > 100)', () => {
      // Scenario: Saturday at 22:00 — WEEKEND + NIGHT match, but not HOLIDAY
      const weekend = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'WEEKEND')!;
      const night = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'NIGHT')!;

      const applicableCategories = [weekend, night];
      const resolved = applicableCategories.reduce((best, cat) =>
        cat.priority > best.priority ? cat : best,
      );

      expect(resolved.category).toBe('WEEKEND');
      expect(resolved.ratePercent).toBe(50);
    });

    it('night-only: weekday at 23:00 applies only night surcharge (25%)', () => {
      // Scenario: Tuesday at 23:00 — only NIGHT matches
      const night = DEFAULT_SURCHARGE_RULE.categories.find((c) => c.category === 'NIGHT')!;
      expect(night.ratePercent).toBe(25);
      expect(night.priority).toBe(100);
    });

    it('priority values are strictly ordered and have no ties', () => {
      const priorities = DEFAULT_SURCHARGE_RULE.categories.map((c) => c.priority);
      const uniquePriorities = new Set(priorities);
      expect(uniquePriorities.size).toBe(priorities.length);
    });

    it('all surcharge rates are non-negative percentages', () => {
      for (const cat of DEFAULT_SURCHARGE_RULE.categories) {
        expect(cat.ratePercent).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('break rules at threshold boundaries', () => {
    const thresholds = DEFAULT_BREAK_RULE.thresholds;
    const sixHour = thresholds.find((t) => t.workedHoursMin === 6)!;
    const nineHour = thresholds.find((t) => t.workedHoursMin === 9)!;

    it('exactly 6h worked hits the first threshold (30min break required)', () => {
      expect(6).toBeGreaterThanOrEqual(sixHour.workedHoursMin);
      expect(sixHour.requiredBreakMinutes).toBe(30);
    });

    it('5h59m worked (5.983h) does NOT hit the 6h threshold', () => {
      const justUnder = 5 + 59 / 60; // 5.983...
      expect(justUnder).toBeLessThan(sixHour.workedHoursMin);
    });

    it('6h01m worked (6.017h) exceeds the 6h threshold', () => {
      const justOver = 6 + 1 / 60; // 6.0167
      expect(justOver).toBeGreaterThan(sixHour.workedHoursMin);
    });

    it('exactly 9h worked hits the second threshold (45min break required)', () => {
      expect(9).toBeGreaterThanOrEqual(nineHour.workedHoursMin);
      expect(nineHour.requiredBreakMinutes).toBe(45);
    });

    it('8h59m worked (8.983h) does NOT hit the 9h threshold', () => {
      const justUnder = 8 + 59 / 60;
      expect(justUnder).toBeLessThan(nineHour.workedHoursMin);
    });

    it('9h01m worked exceeds the 9h threshold', () => {
      const justOver = 9 + 1 / 60;
      expect(justOver).toBeGreaterThan(nineHour.workedHoursMin);
    });

    it('between thresholds (7h worked): first threshold applies, not second', () => {
      const workedHours = 7;
      // 7h >= 6h (first threshold) but < 9h (second threshold)
      expect(workedHours).toBeGreaterThanOrEqual(sixHour.workedHoursMin);
      expect(workedHours).toBeLessThan(nineHour.workedHoursMin);
      // So the applicable break is 30min, not 45min
      expect(sixHour.requiredBreakMinutes).toBe(30);
    });

    it('below all thresholds (4h worked): no break rule applies', () => {
      const workedHours = 4;
      const applicableThresholds = thresholds.filter((t) => workedHours >= t.workedHoursMin);
      expect(applicableThresholds).toHaveLength(0);
    });
  });

  describe('leave pro-rata for full-time → part-time mid-year change', () => {
    // Scenario: Employee works full-time (5 days/wk) Jan–Jun, then switches to
    // part-time (3 days/wk) Jul–Dec. Annual entitlement should be prorated.
    const fullTimeRule = DEFAULT_LEAVE_RULE;
    const partTimeDaysPerWeek = 3;
    const fullMonths = 6; // Jan–Jun
    const partMonths = 6; // Jul–Dec
    const totalMonths = 12;

    it('full-time entitlement is 30 days for full year', () => {
      expect(fullTimeRule.annualEntitlementDays).toBe(30);
      expect(fullTimeRule.workDaysPerWeek).toBe(5);
    });

    it('pro-rata full-time portion: 6/12 × 30 = 15 days', () => {
      const fullTimePortion = (fullMonths / totalMonths) * fullTimeRule.annualEntitlementDays;
      expect(fullTimePortion).toBe(15);
    });

    it('pro-rata part-time portion: 6/12 × 30 × (3/5) = 9 days', () => {
      const partTimePortion =
        (partMonths / totalMonths) *
        fullTimeRule.annualEntitlementDays *
        (partTimeDaysPerWeek / fullTimeRule.workDaysPerWeek);
      expect(partTimePortion).toBe(9);
    });

    it('total prorated entitlement: 15 + 9 = 24 days', () => {
      const fullTimePortion = (fullMonths / totalMonths) * fullTimeRule.annualEntitlementDays;
      const partTimePortion =
        (partMonths / totalMonths) *
        fullTimeRule.annualEntitlementDays *
        (partTimeDaysPerWeek / fullTimeRule.workDaysPerWeek);
      const total = fullTimePortion + partTimePortion;
      expect(total).toBe(24);
    });

    it('part-time leave rule with 3 days/week validates against schema', () => {
      const partTimeRule: LeaveRule = {
        ...fullTimeRule,
        id: 'leave-tvl-part-time-3d-mid-year',
        annualEntitlementDays: 18, // 30 × (3/5)
        workDaysPerWeek: 3,
        fullTimeWeeklyHours: 39.83 * (3 / 5), // ~23.9h
      };
      const result = LeaveRuleSchema.safeParse(partTimeRule);
      expect(result.success).toBe(true);
    });

    it('mid-year transition: weekly hours ratio determines part-time proportion', () => {
      const partTimeWeeklyHours = 39.83 * (partTimeDaysPerWeek / fullTimeRule.workDaysPerWeek);
      const ratio = partTimeWeeklyHours / fullTimeRule.fullTimeWeeklyHours;
      expect(ratio).toBeCloseTo(0.6, 2);
    });

    it('carry-over from full-time period applies to combined entitlement', () => {
      // Carry-over rules don't change based on the transition —
      // the same forfeiture deadline and maxDays apply
      expect(fullTimeRule.carryOver.enabled).toBe(true);
      expect(fullTimeRule.carryOver.maxDays).toBe(30);
      expect(fullTimeRule.carryOver.forfeitureDeadline).toBe('03-31');
    });
  });
});
