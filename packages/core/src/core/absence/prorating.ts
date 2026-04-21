import { toHolidaySet } from '@cueq/shared';
import type { CoreProratedTargetContract } from '@cueq/shared';
import { WEEKDAYS_PER_WEEK } from '../constants';
import { roundToTwo } from '../utils';
import { countWeekdaysInclusive } from './working-days';

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

export function calculateProratedMonthlyTarget(input: ProratedTargetInput): ProratedTargetResult {
  const violations: Array<{ code: string; message: string }> = [];
  const holidayDates = toHolidaySet(input.holidayDates);

  const segmentTarget = input.segments.reduce((sum, segment) => {
    if (segment.weeklyHours < 0) {
      violations.push({
        code: 'NEGATIVE_WEEKLY_HOURS',
        message: `Segment ${segment.from} - ${segment.to} has negative weekly hours.`,
      });
      return sum;
    }

    const weekdays = countWeekdaysInclusive(segment.from, segment.to, holidayDates);
    const dailyHours = segment.weeklyHours / WEEKDAYS_PER_WEEK;
    return sum + weekdays * dailyHours;
  }, 0);

  const transitionAdjustmentHours = input.transitionAdjustmentHours ?? 0;
  const proratedTargetHours = roundToTwo(segmentTarget + transitionAdjustmentHours);

  return {
    proratedTargetHours,
    deltaHours: roundToTwo(input.actualHours - proratedTargetHours),
    violations,
  };
}
