import type { PlausibilityIssue, RuleViolation } from './types';

export const HOURS_PER_DAY = 24;

export function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function safeDate(input: string): Date {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${input}`);
  }

  return date;
}

export function diffHours(startIso: string, endIso: string): number {
  const start = safeDate(startIso);
  const end = safeDate(endIso);
  return (end.getTime() - start.getTime()) / 3_600_000;
}

export function toViolation(
  partial: Omit<RuleViolation, 'severity'> & { severity?: RuleViolation['severity'] },
): RuleViolation {
  return {
    severity: partial.severity ?? 'ERROR',
    ...partial,
  };
}

export function overlapExists(
  intervals: Array<{ start: string; end: string }>,
): PlausibilityIssue[] {
  const sorted = [...intervals]
    .map((interval, index) => ({
      ...interval,
      index,
      startDate: safeDate(interval.start),
      endDate: safeDate(interval.end),
    }))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const issues: PlausibilityIssue[] = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    if (!current || !next) {
      continue;
    }

    if (current.endDate.getTime() > next.startDate.getTime()) {
      issues.push({
        code: 'OVERLAP',
        severity: 'ERROR',
        message: 'Booking intervals overlap in time.',
        index: current.index,
        context: {
          currentStart: current.start,
          currentEnd: current.end,
          nextStart: next.start,
          nextEnd: next.end,
        },
      });
    }
  }

  return issues;
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);

    for (const key of Object.keys(value as Record<string, unknown>)) {
      const nested = (value as Record<string, unknown>)[key];
      if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) {
        deepFreeze(nested);
      }
    }
  }

  return value;
}

export function toIso(date = new Date()): string {
  return date.toISOString();
}
