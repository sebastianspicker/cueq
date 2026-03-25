import type { PlausibilityIssue } from '../types';
import { diffHours, overlapExists } from '../utils';

export interface PlausibilityInterval {
  start: string;
  end?: string;
}

export function evaluatePlausibility(intervals: PlausibilityInterval[]): PlausibilityIssue[] {
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
