import { DEFAULT_LEAVE_RULE, type LeaveRule } from '@cueq/policy';
import { describe, expect, it } from 'vitest';
import {
  AssignmentLeaveLedgerError,
  calculateAssignmentLeaveLedger,
  calculateLeaveLedger,
  countAssignmentWorkingDays,
  EmploymentTermsError,
  resolveEmploymentTermsForInterval,
} from '../index.js';

interface TestTerm {
  id: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  model: string;
}

const compatible = (left: TestTerm, right: TestTerm): boolean => left.model === right.model;

const calendarWeeklyPolicy = {
  proration: 'CALENDAR_DAYS',
  partTimeBasis: 'WEEKLY_HOURS',
  rounding: 'TWO_DECIMALS_AT_TOTAL',
  carryOverPolicyAt: 'YEAR_START',
} as const;

function leaveRule(
  id: string,
  options: {
    annualEntitlementDays?: number;
    fullTimeWeeklyHours?: number;
    workDaysPerWeek?: number;
    carryOverMaxDays?: number;
    forfeitureDeadline?: string;
  } = {},
): LeaveRule {
  return {
    ...DEFAULT_LEAVE_RULE,
    id,
    annualEntitlementDays: options.annualEntitlementDays ?? 30,
    fullTimeWeeklyHours: options.fullTimeWeeklyHours ?? 40,
    workDaysPerWeek: options.workDaysPerWeek ?? 5,
    carryOver: {
      ...DEFAULT_LEAVE_RULE.carryOver,
      maxDays: options.carryOverMaxDays ?? 30,
      forfeitureDeadline: options.forfeitureDeadline ?? '12-31',
    },
  };
}

function expectTermsError(action: () => unknown, code: EmploymentTermsError['code']): void {
  try {
    action();
    throw new Error('Expected employment term resolution to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(EmploymentTermsError);
    expect(error).toMatchObject({ code });
  }
}

function expectAssignmentLeaveError(
  action: () => unknown,
  code: AssignmentLeaveLedgerError['code'],
): void {
  try {
    action();
    throw new Error('Expected assignment leave calculation to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(AssignmentLeaveLedgerError);
    expect(error).toMatchObject({ code });
  }
}

describe('resolveEmploymentTermsForInterval', () => {
  it('uses unknown legacy bounds without inventing boundary dates', () => {
    const terms: TestTerm[] = [
      { id: 'legacy', effectiveFrom: null, effectiveTo: '2026-01-01T00:00:00Z', model: 'full' },
      { id: 'current', effectiveFrom: '2026-01-01T00:00:00Z', effectiveTo: null, model: 'full' },
    ];

    expect(
      resolveEmploymentTermsForInterval(
        terms,
        '1900-01-01T12:00:00Z',
        '2026-01-01T00:00:00Z',
        compatible,
      ).map((term) => term.id),
    ).toEqual(['legacy']);
    expect(
      resolveEmploymentTermsForInterval(terms, '2200-01-01T00:00:00Z', undefined, compatible).map(
        (term) => term.id,
      ),
    ).toEqual(['current']);
  });

  it('applies exact half-open boundaries to ranges and point requests', () => {
    const terms: TestTerm[] = [
      { id: 'before', effectiveFrom: null, effectiveTo: '2026-04-01T00:00:00Z', model: 'a' },
      { id: 'after', effectiveFrom: '2026-04-01T00:00:00Z', effectiveTo: null, model: 'b' },
    ];

    expect(
      resolveEmploymentTermsForInterval(
        terms,
        '2026-03-31T23:00:00Z',
        '2026-04-01T00:00:00Z',
        compatible,
      ).map((term) => term.id),
    ).toEqual(['before']);
    expect(
      resolveEmploymentTermsForInterval(terms, '2026-04-01T00:00:00Z', undefined, compatible).map(
        (term) => term.id,
      ),
    ).toEqual(['after']);
  });

  it('rejects missing coverage at the start or inside a range', () => {
    const terms: TestTerm[] = [
      {
        id: 'first',
        effectiveFrom: '2026-01-01T00:00:00Z',
        effectiveTo: '2026-02-01T00:00:00Z',
        model: 'full',
      },
      {
        id: 'second',
        effectiveFrom: '2026-03-01T00:00:00Z',
        effectiveTo: null,
        model: 'full',
      },
    ];

    expectTermsError(
      () => resolveEmploymentTermsForInterval(terms, '2025-12-01T00:00:00Z', undefined, compatible),
      'NO_EFFECTIVE_TERM',
    );
    expectTermsError(
      () =>
        resolveEmploymentTermsForInterval(
          terms,
          '2026-01-15T00:00:00Z',
          '2026-03-15T00:00:00Z',
          compatible,
        ),
      'NO_EFFECTIVE_TERM',
    );
  });

  it('rejects overlapping terms even when their business configuration matches', () => {
    const terms: TestTerm[] = [
      {
        id: 'first',
        effectiveFrom: '2026-01-01T00:00:00Z',
        effectiveTo: '2026-04-01T00:00:00Z',
        model: 'full',
      },
      {
        id: 'overlap',
        effectiveFrom: '2026-03-01T00:00:00Z',
        effectiveTo: null,
        model: 'full',
      },
    ];

    expectTermsError(
      () =>
        resolveEmploymentTermsForInterval(
          terms,
          '2026-02-01T00:00:00Z',
          '2026-05-01T00:00:00Z',
          compatible,
        ),
      'AMBIGUOUS_TERMS',
    );
  });

  it('traverses contiguous compatible terms in chronological order', () => {
    const terms: TestTerm[] = [
      { id: 'third', effectiveFrom: '2026-03-01T00:00:00Z', effectiveTo: null, model: 'full' },
      {
        id: 'first',
        effectiveFrom: null,
        effectiveTo: '2026-02-01T00:00:00Z',
        model: 'full',
      },
      {
        id: 'second',
        effectiveFrom: '2026-02-01T00:00:00Z',
        effectiveTo: '2026-03-01T00:00:00Z',
        model: 'full',
      },
    ];

    expect(
      resolveEmploymentTermsForInterval(
        terms,
        '2026-01-15T00:00:00Z',
        '2026-03-15T00:00:00Z',
        compatible,
      ).map((term) => term.id),
    ).toEqual(['first', 'second', 'third']);
  });

  it('rejects a range crossing a contiguous incompatible change', () => {
    const terms: TestTerm[] = [
      { id: 'old', effectiveFrom: null, effectiveTo: '2026-06-01T00:00:00Z', model: 'full' },
      { id: 'new', effectiveFrom: '2026-06-01T00:00:00Z', effectiveTo: null, model: 'part' },
    ];

    expectTermsError(
      () =>
        resolveEmploymentTermsForInterval(
          terms,
          '2026-05-31T23:00:00Z',
          '2026-06-01T01:00:00Z',
          compatible,
        ),
      'INCOMPATIBLE_TERMS',
    );
  });

  it('rejects malformed, reversed, and empty intervals with a typed error', () => {
    const terms: TestTerm[] = [
      { id: 'open', effectiveFrom: null, effectiveTo: null, model: 'full' },
    ];

    for (const [from, to] of [
      ['not-a-date', undefined],
      ['2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z'],
      ['2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'],
    ] as const) {
      expectTermsError(
        () => resolveEmploymentTermsForInterval(terms, from, to, compatible),
        'INVALID_INTERVAL',
      );
    }
  });
});

describe('countAssignmentWorkingDays', () => {
  it('counts inclusive configured weekdays across a leap day and excludes duplicate holidays', () => {
    expect(
      countAssignmentWorkingDays({
        startDate: '2024-02-26',
        endDate: '2024-03-03',
        workingDays: [1, 2, 3, 4, 5, 5],
        holidayDates: ['2024-02-29', '2024-02-29'],
      }),
    ).toBe(4);
  });

  it('supports weekend work patterns and inclusive single-day assignments', () => {
    expect(
      countAssignmentWorkingDays({
        startDate: '2026-08-01',
        endDate: '2026-08-02',
        workingDays: [6, 7],
        holidayDates: ['2026-08-01'],
      }),
    ).toBe(1);
    expect(
      countAssignmentWorkingDays({
        startDate: '2026-08-03',
        endDate: '2026-08-03',
        workingDays: [1],
        holidayDates: [],
      }),
    ).toBe(1);
  });

  it('validates endpoints, configured weekdays, and holidays', () => {
    expect(() =>
      countAssignmentWorkingDays({
        startDate: '2026-08-03',
        endDate: '2026-08-02',
        workingDays: [1],
        holidayDates: [],
      }),
    ).toThrow(RangeError);
    expect(() =>
      countAssignmentWorkingDays({
        startDate: '2026-08-03',
        endDate: '2026-08-03',
        workingDays: [0, 1],
        holidayDates: [],
      }),
    ).toThrow('ISO weekdays');
    expect(() =>
      countAssignmentWorkingDays({
        startDate: '2026-08-03',
        endDate: '2026-08-03',
        workingDays: [1],
        holidayDates: ['2026-02-29'],
      }),
    ).toThrow('Invalid date');
  });
});

describe('calculateAssignmentLeaveLedger', () => {
  it('delegates a single compatible configuration to the legacy ledger exactly', () => {
    const rule = leaveRule('legacy');
    const input = {
      year: 2026,
      asOfDate: '2026-10-01',
      workTimeModelWeeklyHours: 20,
      employmentStartDate: '2026-04-01',
      employmentEndDate: '2026-12-31',
      priorYearCarryOverDays: 4,
      annualLeaveUsage: [{ date: '2026-06-01', days: 2 }],
      adjustments: [{ year: 2026, deltaDays: 1 }],
      segments: [
        {
          from: '2026-01-01',
          to: '2026-12-31',
          weeklyHours: 20,
          workingDays: [1, 2, 3, 4, 5],
          rule,
        },
      ],
    };

    expect(calculateAssignmentLeaveLedger(input)).toEqual(calculateLeaveLedger(input, rule));
  });

  it('prorates mid-month term changes by calendar days across a leap year and rounds once', () => {
    const rule = leaveRule('leap');
    expect(
      calculateAssignmentLeaveLedger({
        year: 2024,
        asOfDate: '2024-12-31',
        workTimeModelWeeklyHours: 40,
        segments: [
          {
            from: '2024-01-01',
            to: '2024-02-14',
            weeklyHours: 40,
            workingDays: [1, 2, 3, 4, 5],
            rule,
          },
          {
            from: '2024-02-15',
            to: '2024-12-31',
            weeklyHours: 20,
            workingDays: [1, 2, 3],
            rule,
          },
        ],
        calculationPolicy: calendarWeeklyPolicy,
      }).entitlementDays,
    ).toBe(16.84);
  });

  it('requires an explicit calculation policy when covered configurations differ', () => {
    const rule = leaveRule('policy-required');
    expectAssignmentLeaveError(
      () =>
        calculateAssignmentLeaveLedger({
          year: 2026,
          asOfDate: '2026-12-31',
          workTimeModelWeeklyHours: 40,
          segments: [
            {
              from: '2026-01-01',
              to: '2026-06-30',
              weeklyHours: 40,
              workingDays: [1, 2, 3, 4, 5],
              rule,
            },
            {
              from: '2026-07-01',
              to: '2026-12-31',
              weeklyHours: 20,
              workingDays: [1, 2, 3],
              rule,
            },
          ],
        }),
      'CALCULATION_POLICY_REQUIRED',
    );
  });

  it.each([
    {
      name: 'overlap',
      secondFrom: '2026-06-30',
    },
    {
      name: 'gap',
      secondFrom: '2026-07-02',
    },
  ])('rejects segment $name within the covered employment interval', ({ secondFrom }) => {
    const rule = leaveRule('coverage');
    expectAssignmentLeaveError(
      () =>
        calculateAssignmentLeaveLedger({
          year: 2026,
          asOfDate: '2026-12-31',
          workTimeModelWeeklyHours: 40,
          segments: [
            {
              from: '2026-01-01',
              to: '2026-06-30',
              weeklyHours: 40,
              workingDays: [1, 2, 3, 4, 5],
              rule,
            },
            {
              from: secondFrom,
              to: '2026-12-31',
              weeklyHours: 20,
              workingDays: [1, 2, 3],
              rule,
            },
          ],
          calculationPolicy: calendarWeeklyPolicy,
        }),
      'INVALID_SEGMENT_COVERAGE',
    );
  });

  it('uses the configured weekly-hours or working-days part-time basis', () => {
    const rule = leaveRule('basis');
    const input = {
      year: 2025,
      asOfDate: '2025-12-31',
      workTimeModelWeeklyHours: 40,
      segments: [
        {
          from: '2025-01-01',
          to: '2025-06-30',
          weeklyHours: 40,
          workingDays: [1, 2, 3, 4, 5],
          rule,
        },
        {
          from: '2025-07-01',
          to: '2025-12-31',
          weeklyHours: 20,
          workingDays: [1, 2, 3],
          rule,
        },
      ],
    };

    expect(
      calculateAssignmentLeaveLedger({
        ...input,
        calculationPolicy: calendarWeeklyPolicy,
      }).entitlementDays,
    ).toBe(22.44);
    expect(
      calculateAssignmentLeaveLedger({
        ...input,
        calculationPolicy: { ...calendarWeeklyPolicy, partTimeBasis: 'WORKING_DAYS' },
      }).entitlementDays,
    ).toBe(23.95);
  });

  it.each([
    { carryOverPolicyAt: 'YEAR_START' as const, expected: 2 },
    { carryOverPolicyAt: 'YEAR_END' as const, expected: 8 },
    { carryOverPolicyAt: 'AS_OF' as const, expected: 2 },
  ])(
    'selects the carry-over rule at $carryOverPolicyAt clamped to employment coverage',
    ({ carryOverPolicyAt, expected }) => {
      const earlyRule = leaveRule('early-carry', { carryOverMaxDays: 2 });
      const lateRule = leaveRule('late-carry', { carryOverMaxDays: 8 });
      expect(
        calculateAssignmentLeaveLedger({
          year: 2026,
          asOfDate: '2026-04-01',
          workTimeModelWeeklyHours: 40,
          employmentStartDate: '2026-03-01',
          employmentEndDate: '2026-10-31',
          priorYearCarryOverDays: 10,
          segments: [
            {
              from: '2026-03-01',
              to: '2026-06-30',
              weeklyHours: 40,
              workingDays: [1, 2, 3, 4, 5],
              rule: earlyRule,
            },
            {
              from: '2026-07-01',
              to: '2026-10-31',
              weeklyHours: 40,
              workingDays: [1, 2, 3, 4, 5],
              rule: lateRule,
            },
          ],
          calculationPolicy: { ...calendarWeeklyPolicy, carryOverPolicyAt },
        }).carriedOverDays,
      ).toBe(expected);
    },
  );

  it('preserves the legacy carry, usage, adjustment, and remaining-day math without duplicate credit', () => {
    const earlyRule = leaveRule('early', { annualEntitlementDays: 30, carryOverMaxDays: 5 });
    const lateRule = leaveRule('late', { annualEntitlementDays: 24, carryOverMaxDays: 5 });
    const result = calculateAssignmentLeaveLedger({
      year: 2025,
      asOfDate: '2025-12-31',
      workTimeModelWeeklyHours: 40,
      priorYearCarryOverDays: 3,
      annualLeaveUsage: [{ date: '2025-08-01', days: 4 }],
      adjustments: [{ year: 2025, deltaDays: 1 }],
      segments: [
        {
          from: '2025-01-01',
          to: '2025-06-30',
          weeklyHours: 40,
          workingDays: [1, 2, 3, 4, 5],
          rule: earlyRule,
        },
        {
          from: '2025-07-01',
          to: '2025-12-31',
          weeklyHours: 40,
          workingDays: [1, 2, 3, 4, 5],
          rule: lateRule,
        },
      ],
      calculationPolicy: calendarWeeklyPolicy,
    });

    expect(result).toMatchObject({
      entitlementDays: 26.98,
      carriedOverDays: 3,
      usedDays: 4,
      carriedOverUsedDays: 3,
      currentYearUsedDays: 1,
      adjustmentsDays: 1,
      remainingDays: 26.98,
    });
  });
});
