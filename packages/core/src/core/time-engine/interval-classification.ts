import type { RuleViolation } from '../types';
import { overlapExists, toViolation } from '../utils';
import { isWorkIntervalType } from './surcharge';
import type { TimeRuleInterval } from './types';

export interface ClassifiedIntervals {
  workIntervals: TimeRuleInterval[];
  pauseIntervals: TimeRuleInterval[];
}

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

export function mergeWorkIntervals(intervals: TimeRuleInterval[]): TimeRuleInterval[] {
  const merged: TimeRuleInterval[] = [];

  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (!previous || previous.end <= interval.start) {
      merged.push(interval);
    } else if (interval.end > previous.end) {
      previous.end = interval.end;
    }
  }

  return merged;
}

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
