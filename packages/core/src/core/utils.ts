/** Small deterministic helpers shared across core-domain calculations. */
import { parseIsoDateTime } from '@cueq/shared';
import type { PlausibilityIssue, RuleViolation } from './types.js';

/** Round hour/day outputs to the precision used by public domain contracts. */
export function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Calculate elapsed hours between two validated ISO instants. */
export function diffHours(startIso: string, endIso: string): number {
  const start = parseIsoDateTime(startIso);
  const end = parseIsoDateTime(endIso);
  return (end.getTime() - start.getTime()) / 3_600_000;
}

/** Compare validated ISO datetime strings by instant rather than their textual precision. */
export function compareIsoInstants(leftIso: string, rightIso: string): number {
  return parseIsoDateTime(leftIso).getTime() - parseIsoDateTime(rightIso).getTime();
}

/** Apply the default error severity while preserving an explicitly supplied severity. */
export function toViolation(
  partial: Omit<RuleViolation, 'severity'> & { severity?: RuleViolation['severity'] },
): RuleViolation {
  return {
    severity: partial.severity ?? 'ERROR',
    ...partial,
  };
}

/**
 * Detects overlapping intervals using a sorted-adjacent check.
 *
 * This approach is correct because after sorting by start time, any overlap
 * between non-adjacent intervals necessarily implies an overlap with the
 * adjacent interval in between (a longer interval that would overlap a
 * non-adjacent one must also extend past the start of the next adjacent
 * interval). Therefore, checking only adjacent pairs is sufficient to detect
 * the presence of ANY overlap.
 */
export function overlapExists(
  intervals: Array<{ start: string; end: string }>,
): PlausibilityIssue[] {
  const sorted = [...intervals]
    .map((interval, index) => ({
      ...interval,
      index,
      startDate: parseIsoDateTime(interval.start),
      endDate: parseIsoDateTime(interval.end),
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

/** Recursively freeze nested objects so audit and rule results remain immutable. */
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

/** Serialize a date to the canonical ISO instant used by domain outputs. */
export function toIso(date = new Date()): string {
  return date.toISOString();
}
