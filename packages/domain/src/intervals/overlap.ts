/** Detect overlap among validated ISO time intervals. */
import { parseIsoDateTime } from '../calendar/date-parsing.js';
import type { PlausibilityIssue } from '../types.js';

/**
 * Detect overlapping intervals using a sorted-adjacent check.
 *
 * This approach is correct because after sorting by start time, any overlap
 * between non-adjacent intervals necessarily implies an overlap with the
 * adjacent interval in between (a longer interval that would overlap a
 * non-adjacent one must also extend past the start of the next adjacent
 * interval). Therefore, checking only adjacent pairs is sufficient to detect
 * the presence of any overlap.
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
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());

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
