import { parseDateOnly, toHolidaySet } from '@cueq/shared';
import type { CoreProratedTargetContract } from '@cueq/shared';
import { WEEKDAYS_PER_WEEK } from '../constants';
import { roundToTwo } from '../utils';

export interface WorkSegment {
  from: string;
  to: string;
  weeklyHours: number;
}

export type ProratedTargetInput = CoreProratedTargetContract['input'] & {
  personCode?: string;
  segments: WorkSegment[];
  holidayDates?: string[];
};

export type ProratedTargetResult = CoreProratedTargetContract['output'] & {
  violations: Array<{ code: string; message: string }>;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthBounds(month: string): { start: Date; end: Date } {
  const start = parseDateOnly(`${month}-01`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { start, end };
}

export function calculateProratedMonthlyTarget(input: ProratedTargetInput): ProratedTargetResult {
  const violations: Array<{ code: string; message: string }> = [];
  const holidayDates = toHolidaySet(input.holidayDates);
  const { start: monthStart, end: monthEnd } = monthBounds(input.month);
  const coveredDates = new Set<string>();

  const segmentTarget = [...input.segments]
    .sort((left, right) => left.from.localeCompare(right.from))
    .reduce((sum, segment) => {
      if (segment.weeklyHours < 0) {
        violations.push({
          code: 'NEGATIVE_WEEKLY_HOURS',
          message: `Segment ${segment.from} - ${segment.to} has negative weekly hours.`,
        });
        return sum;
      }

      const segmentStart = parseDateOnly(segment.from);
      const segmentEnd = parseDateOnly(segment.to);
      const clippedStart = segmentStart > monthStart ? segmentStart : monthStart;
      const clippedEnd = segmentEnd < monthEnd ? segmentEnd : monthEnd;

      if (clippedStart > clippedEnd) {
        return sum;
      }

      const dailyHours = segment.weeklyHours / WEEKDAYS_PER_WEEK;

      let segmentHours = 0;
      for (
        const date = new Date(clippedStart);
        date <= clippedEnd;
        date.setUTCDate(date.getUTCDate() + 1)
      ) {
        const isoDate = toIsoDate(date);
        const weekday = date.getUTCDay();
        if (
          weekday === 0 ||
          weekday === 6 ||
          holidayDates.has(isoDate) ||
          coveredDates.has(isoDate)
        ) {
          continue;
        }
        coveredDates.add(isoDate);
        segmentHours += dailyHours;
      }

      return sum + segmentHours;
    }, 0);

  const transitionAdjustmentHours = input.transitionAdjustmentHours ?? 0;
  const proratedTargetHours = roundToTwo(segmentTarget + transitionAdjustmentHours);

  return {
    proratedTargetHours,
    deltaHours: roundToTwo(input.actualHours - proratedTargetHours),
    violations,
  };
}
