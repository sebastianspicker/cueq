import {
  DEFAULT_BREAK_RULE,
  DEFAULT_MAX_HOURS_RULE,
  DEFAULT_REST_RULE,
  DEFAULT_SURCHARGE_RULE,
} from '@cueq/policy';
import type { BreakRule, MaxHoursRule, RestRule, SurchargeCategory, SurchargeRule } from '@cueq/policy';
import type {
  CoreFlextimeCalculationContract,
  CoreOnCallRestContract,
  CoreTimeRuleEvaluationContract,
} from '@cueq/shared';
import type { DomainWarning, PlausibilityIssue, RuleViolation } from '../types';
import { diffHours, overlapExists, roundToTwo, toViolation } from '../utils';

export type FlextimeWeekBooking = CoreFlextimeCalculationContract['input']['bookings'][number];

export interface PlausibilityInterval {
  start: string;
  end?: string;
}

export type FlextimeWeekInput = CoreFlextimeCalculationContract['input'] & {
  personCode?: string;
  bookingIntervals?: PlausibilityInterval[];
  dailyRestHours?: number[];
};

export type FlextimeWeekResult = Omit<CoreFlextimeCalculationContract['output'], 'violations'> & {
  violations: RuleViolation[];
  warnings: DomainWarning[];
  plausibilityIssues: PlausibilityIssue[];
};

export interface TimeEnginePolicy {
  breakRule?: BreakRule;
  maxHoursRule?: MaxHoursRule;
  restRule?: RestRule;
  surchargeRule?: SurchargeRule;
}

const MINUTE_MS = 60_000;
const WEEKDAY_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};
const SURCHARGE_TIE_BREAK: Record<SurchargeCategory, number> = {
  HOLIDAY: 3,
  WEEKEND: 2,
  NIGHT: 1,
};
const WORK_INTERVAL_TYPES = new Set(['WORK', 'DEPLOYMENT']);

function requiredBreakMinutes(workedHours: number, rule: BreakRule): number {
  return rule.thresholds
    .filter((threshold) => workedHours >= threshold.workedHoursMin)
    .reduce((minutes, threshold) => Math.max(minutes, threshold.requiredBreakMinutes), 0);
}

function evaluatePlausibility(intervals: PlausibilityInterval[]): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];
  const completeIntervals: Array<{ start: string; end: string }> = [];

  intervals.forEach((interval, index) => {
    if (!interval.end) {
      issues.push({
        code: 'MISSING_END',
        severity: 'ERROR',
        message: 'Booking interval has no end timestamp.',
        index,
      });
      return;
    }

    const durationHours = diffHours(interval.start, interval.end);
    if (durationHours <= 0) {
      issues.push({
        code: 'NEGATIVE_DURATION',
        severity: 'ERROR',
        message: 'Booking interval has negative or zero duration.',
        index,
        context: { start: interval.start, end: interval.end },
      });
      return;
    }

    completeIntervals.push({ start: interval.start, end: interval.end });
  });

  issues.push(...overlapExists(completeIntervals));

  return issues;
}

interface ZonedMinute {
  isoDate: string;
  weekday: number;
  localMinuteOfDay: number;
}

function parseLocalTimeToMinute(localTime: string): number {
  const [hourRaw, minuteRaw] = localTime.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return 0;
  }

  return hour * 60 + minute;
}

function isWithinWindow(localMinuteOfDay: number, startMinute: number, endMinute: number): boolean {
  if (startMinute === endMinute) {
    return true;
  }

  if (startMinute < endMinute) {
    return localMinuteOfDay >= startMinute && localMinuteOfDay < endMinute;
  }

  return localMinuteOfDay >= startMinute || localMinuteOfDay < endMinute;
}

function localMinuteInfo(timestamp: number, formatter: Intl.DateTimeFormat): ZonedMinute {
  const parts = formatter.formatToParts(new Date(timestamp));
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  const year = byType.get('year') ?? '1970';
  const month = byType.get('month') ?? '01';
  const day = byType.get('day') ?? '01';
  const weekdayName = byType.get('weekday') ?? 'Mon';
  const hour = Number(byType.get('hour') ?? '0');
  const minute = Number(byType.get('minute') ?? '0');

  return {
    isoDate: `${year}-${month}-${day}`,
    weekday: WEEKDAY_TO_INDEX[weekdayName] ?? 1,
    localMinuteOfDay: hour * 60 + minute,
  };
}

function isWorkIntervalType(type: string): boolean {
  return WORK_INTERVAL_TYPES.has(type);
}

function selectSurchargeCategory(
  categories: SurchargeCategory[],
  surchargeRule: SurchargeRule,
): SurchargeCategory | null {
  if (categories.length === 0) {
    return null;
  }

  const configByCategory = new Map(
    surchargeRule.categories.map((entry) => [entry.category, entry]),
  );

  return (
    [...categories].sort((left, right) => {
      const leftPriority = configByCategory.get(left)?.priority ?? 0;
      const rightPriority = configByCategory.get(right)?.priority ?? 0;
      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }

      return SURCHARGE_TIE_BREAK[right] - SURCHARGE_TIE_BREAK[left];
    })[0] ?? null
  );
}

export type TimeRuleInterval = CoreTimeRuleEvaluationContract['input']['intervals'][number];

export type TimeRuleEvaluationInput = CoreTimeRuleEvaluationContract['input'] & {
  personCode?: string;
};

export type TimeRuleEvaluationResult = Omit<CoreTimeRuleEvaluationContract['output'], 'violations' | 'warnings'> & {
  violations: RuleViolation[];
  warnings: DomainWarning[];
};

export function evaluateTimeRules(
  input: TimeRuleEvaluationInput,
  policy: TimeEnginePolicy = {},
): TimeRuleEvaluationResult {
  const breakRule = policy.breakRule ?? DEFAULT_BREAK_RULE;
  const maxHoursRule = policy.maxHoursRule ?? DEFAULT_MAX_HOURS_RULE;
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;
  const surchargeRule = policy.surchargeRule ?? DEFAULT_SURCHARGE_RULE;
  const timezone = input.timezone ?? surchargeRule.timezoneDefault ?? 'Europe/Berlin';

  const warnings: DomainWarning[] = [];
  const violations: RuleViolation[] = [];
  const holidayDates = new Set(input.holidayDates ?? []);
  const daily = new Map<string, { workMinutes: number; pauseMinutes: number }>();
  const surchargeBuckets = new Map<SurchargeCategory, number>();
  let totalWorkMinutes = 0;

  const sortedIntervals = [...input.intervals].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  const workIntervalsForRest: TimeRuleInterval[] = [];

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const nightStart = parseLocalTimeToMinute(surchargeRule.nightWindow.startLocalTime);
  const nightEnd = parseLocalTimeToMinute(surchargeRule.nightWindow.endLocalTime);
  const categoryConfigByCategory = new Map(
    surchargeRule.categories.map((entry) => [entry.category, entry]),
  );

  for (const interval of sortedIntervals) {
    const start = new Date(interval.start);
    const end = new Date(interval.end);
    const startMs = start.getTime();
    const endMs = end.getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      violations.push(
        toViolation({
          code: 'INVALID_INTERVAL',
          message: 'Interval end must be after start and both must be valid ISO datetimes.',
          context: { start: interval.start, end: interval.end, type: interval.type },
        }),
      );
      continue;
    }

    if (isWorkIntervalType(interval.type)) {
      workIntervalsForRest.push(interval);
    }

    for (let cursor = startMs; cursor < endMs; cursor += MINUTE_MS) {
      const localMinute = localMinuteInfo(cursor, formatter);
      const day = daily.get(localMinute.isoDate) ?? { workMinutes: 0, pauseMinutes: 0 };

      if (isWorkIntervalType(interval.type)) {
        day.workMinutes += 1;
        totalWorkMinutes += 1;

        const matchedCategories: SurchargeCategory[] = [];
        if (holidayDates.has(localMinute.isoDate)) {
          matchedCategories.push('HOLIDAY');
        }
        if (localMinute.weekday === 0 || localMinute.weekday === 6) {
          matchedCategories.push('WEEKEND');
        }
        if (isWithinWindow(localMinute.localMinuteOfDay, nightStart, nightEnd)) {
          matchedCategories.push('NIGHT');
        }

        const selected = selectSurchargeCategory(matchedCategories, surchargeRule);
        if (selected) {
          surchargeBuckets.set(selected, (surchargeBuckets.get(selected) ?? 0) + 1);
        }
      } else if (interval.type === 'PAUSE') {
        day.pauseMinutes += 1;
      }

      daily.set(localMinute.isoDate, day);
    }
  }

  const sortedRestIntervals = [...workIntervalsForRest].sort((left, right) =>
    left.start.localeCompare(right.start),
  );
  for (let index = 0; index < sortedRestIntervals.length - 1; index += 1) {
    const current = sortedRestIntervals[index];
    const next = sortedRestIntervals[index + 1];
    if (!current || !next) {
      continue;
    }

    const restHours = roundToTwo(diffHours(current.end, next.start));
    if (restHours < restRule.minRestHours) {
      violations.push(
        toViolation({
          code: 'REST_HOURS_DEFICIT',
          message: `Rest period ${restHours}h is below required ${restRule.minRestHours}h.`,
          ruleId: restRule.id,
          ruleName: restRule.name,
          context: { previousEnd: current.end, nextStart: next.start, restHours },
        }),
      );
    }
  }

  for (const [day, totals] of daily.entries()) {
    const workedHours = roundToTwo(totals.workMinutes / 60);
    if (workedHours > maxHoursRule.maxDailyHoursExtended) {
      violations.push(
        toViolation({
          code: 'MAX_DAILY_HOURS_EXCEEDED',
          message: `Worked hours ${workedHours} exceed daily maximum ${maxHoursRule.maxDailyHoursExtended}.`,
          ruleId: maxHoursRule.id,
          ruleName: maxHoursRule.name,
          context: { day, workedHours },
        }),
      );
    } else if (workedHours > maxHoursRule.maxDailyHours) {
      warnings.push({
        code: 'MAX_DAILY_HOURS_EXTENDED_RANGE',
        message:
          'Daily hours exceed the standard maximum and require compensatory tracking within the reference period.',
        context: { day, workedHours },
      });
    }

    const expectedBreak = requiredBreakMinutes(workedHours, breakRule);
    if (totals.pauseMinutes < expectedBreak) {
      violations.push(
        toViolation({
          code: 'BREAK_DEFICIT',
          message: `Required break is ${expectedBreak} minutes, but only ${totals.pauseMinutes} minutes were recorded.`,
          ruleId: breakRule.id,
          ruleName: breakRule.name,
          context: { day, requiredBreakMinutes: expectedBreak, breakMinutes: totals.pauseMinutes },
        }),
      );
    }
  }

  const actualHours = roundToTwo(totalWorkMinutes / 60);
  if (actualHours > maxHoursRule.maxWeeklyHours) {
    violations.push(
      toViolation({
        code: 'MAX_WEEKLY_HOURS_EXCEEDED',
        message: `Weekly worked hours ${actualHours} exceed maximum ${maxHoursRule.maxWeeklyHours}.`,
        ruleId: maxHoursRule.id,
        ruleName: maxHoursRule.name,
      }),
    );
  }

  const surchargeMinutes = [...surchargeBuckets.entries()]
    .map(([category, minutes]) => ({
      category,
      minutes,
      ratePercent: categoryConfigByCategory.get(category)?.ratePercent ?? 0,
    }))
    .sort((left, right) => {
      const leftPriority = categoryConfigByCategory.get(left.category)?.priority ?? 0;
      const rightPriority = categoryConfigByCategory.get(right.category)?.priority ?? 0;
      return rightPriority - leftPriority;
    });

  return {
    actualHours,
    deltaHours: roundToTwo(actualHours - input.targetHours),
    violations,
    warnings,
    surchargeMinutes,
  };
}

export function calculateFlextimeWeek(
  input: FlextimeWeekInput,
  policy: TimeEnginePolicy = {},
): FlextimeWeekResult {
  const breakRule = policy.breakRule ?? DEFAULT_BREAK_RULE;
  const maxHoursRule = policy.maxHoursRule ?? DEFAULT_MAX_HOURS_RULE;
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;

  const violations: RuleViolation[] = [];
  const warnings: DomainWarning[] = [];

  const actualHours = roundToTwo(
    input.bookings.reduce((sum, booking) => sum + booking.workedHours, 0),
  );

  for (const booking of input.bookings) {
    if (booking.workedHours > maxHoursRule.maxDailyHoursExtended) {
      violations.push(
        toViolation({
          code: 'MAX_DAILY_HOURS_EXCEEDED',
          message: `Worked hours ${booking.workedHours} exceed daily maximum ${maxHoursRule.maxDailyHoursExtended}.`,
          ruleId: maxHoursRule.id,
          ruleName: maxHoursRule.name,
          context: { day: booking.day, workedHours: booking.workedHours },
        }),
      );
    } else if (booking.workedHours > maxHoursRule.maxDailyHours) {
      warnings.push({
        code: 'MAX_DAILY_HOURS_EXTENDED_RANGE',
        message:
          'Daily hours exceed the standard maximum and require compensatory tracking within the reference period.',
        context: { day: booking.day, workedHours: booking.workedHours },
      });
    }

    const expectedBreak = requiredBreakMinutes(booking.workedHours, breakRule);
    if ((booking.breakMinutes ?? expectedBreak) < expectedBreak) {
      violations.push(
        toViolation({
          code: 'BREAK_DEFICIT',
          message: `Required break is ${expectedBreak} minutes, but only ${booking.breakMinutes ?? 0} minutes were recorded.`,
          ruleId: breakRule.id,
          ruleName: breakRule.name,
          context: { day: booking.day, requiredBreakMinutes: expectedBreak },
        }),
      );
    }
  }

  if (actualHours > maxHoursRule.maxWeeklyHours) {
    violations.push(
      toViolation({
        code: 'MAX_WEEKLY_HOURS_EXCEEDED',
        message: `Weekly worked hours ${actualHours} exceed maximum ${maxHoursRule.maxWeeklyHours}.`,
        ruleId: maxHoursRule.id,
        ruleName: maxHoursRule.name,
      }),
    );
  }

  if (input.dailyRestHours) {
    input.dailyRestHours.forEach((restHours, index) => {
      if (restHours < restRule.minRestHours) {
        violations.push(
          toViolation({
            code: 'REST_HOURS_DEFICIT',
            message: `Rest period ${restHours}h is below required ${restRule.minRestHours}h.`,
            ruleId: restRule.id,
            ruleName: restRule.name,
            context: { index, restHours },
          }),
        );
      }
    });
  }

  const plausibilityIssues = evaluatePlausibility(input.bookingIntervals ?? []);

  return {
    actualHours,
    deltaHours: roundToTwo(actualHours - input.targetHours),
    violations,
    warnings,
    plausibilityIssues,
  };
}

export interface OnCallDeployment {
  start: string;
  end: string;
}

export type OnCallRestInput = CoreOnCallRestContract['input'] & {
  personCode?: string;
  deployments: OnCallDeployment[];
};

export type OnCallRestResult = Omit<CoreOnCallRestContract['output'], 'violations'> & {
  violations: RuleViolation[];
};

export function evaluateOnCallRestCompliance(
  input: OnCallRestInput,
  policy: { restRule?: RestRule } = {},
): OnCallRestResult {
  const restRule = policy.restRule ?? DEFAULT_REST_RULE;
  const minimumRestHours =
    restRule.onCallRestReduction?.enabled &&
    restRule.onCallRestReduction.minRestHoursAfterDeployment
      ? restRule.onCallRestReduction.minRestHoursAfterDeployment
      : restRule.minRestHours;

  const lastDeployment = [...input.deployments].sort((left, right) =>
    right.end.localeCompare(left.end),
  )[0];

  if (!lastDeployment) {
    return {
      restHoursAfterDeployment: 0,
      minimumRestHours,
      compliant: true,
      violations: [],
    };
  }

  const restHoursAfterDeployment = roundToTwo(diffHours(lastDeployment.end, input.nextShiftStart));
  const compliant = restHoursAfterDeployment >= minimumRestHours;

  const violations = compliant
    ? []
    : [
        toViolation({
          code: 'ONCALL_REST_DEFICIT',
          message: `Rest after deployment is ${restHoursAfterDeployment}h and below required ${minimumRestHours}h.`,
          ruleId: restRule.id,
          ruleName: restRule.name,
          context: {
            deploymentEnd: lastDeployment.end,
            nextShiftStart: input.nextShiftStart,
          },
        }),
      ];

  return {
    restHoursAfterDeployment,
    minimumRestHours,
    compliant,
    violations,
  };
}
