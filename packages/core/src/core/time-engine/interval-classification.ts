/** Validates and classifies time intervals before minute accounting and rule evaluation. */
import type { RuleViolation } from '../types.js';
import { compareIsoInstants, overlapExists, toViolation } from '../utils.js';
import { isWorkIntervalType } from './surcharge.js';
import type { TimeRuleInterval } from './types.js';

export interface ClassifiedIntervals {
  workIntervals: TimeRuleInterval[];
  pauseIntervals: TimeRuleInterval[];
}

/** Partition valid work and pause intervals while recording invalid ranges as violations. */
export function classifyIntervals(
  sortedIntervals: TimeRuleInterval[],
  violations: RuleViolation[],
): ClassifiedIntervals {
  const workIntervals: TimeRuleInterval[] = [];
  const pauseIntervals: TimeRuleInterval[] = [];

  for (const interval of sortedIntervals) {
    const startMs = new Date(interval.start).getTime();
    const endMs = new Date(interval.end).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      violations.push(
        toViolation({
          code: 'INVALID_INTERVAL',
          message: 'Interval end must be after start and both must be valid ISO datetimes.',
          context: { start: interval.start, end: interval.end, type: interval.type },
        }),
      );
    } else if (isWorkIntervalType(interval.type)) {
      workIntervals.push(interval);
    } else if (interval.type === 'PAUSE') {
      pauseIntervals.push(interval);
    }
  }

  return { workIntervals, pauseIntervals };
}

/** Merge sorted overlapping intervals so later accounting cannot double-count minutes. */
export function mergeWorkIntervals(intervals: TimeRuleInterval[]): TimeRuleInterval[] {
  const merged: TimeRuleInterval[] = [];

  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (!previous || compareIsoInstants(previous.end, interval.start) <= 0) {
      merged.push(interval);
    } else if (compareIsoInstants(interval.end, previous.end) > 0) {
      previous.end = interval.end;
    }
  }

  return merged;
}

/** Translate raw work-interval overlaps into normalized domain violations. */
export function addOverlapViolations(
  workIntervals: TimeRuleInterval[],
  violations: RuleViolation[],
): void {
  for (const issue of overlapExists(workIntervals.map(({ start, end }) => ({ start, end })))) {
    violations.push(
      toViolation({ code: 'OVERLAP', message: issue.message, context: issue.context }),
    );
  }
}
