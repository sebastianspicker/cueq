import type { BreakRule } from '@cueq/policy';
import { NIGHT_SHIFT_MIN_BREAK_MINUTES, SHIFT_TYPE_NIGHT } from './constants';

/**
 * Calculate the required break minutes based on worked hours and a break rule's thresholds.
 * Optionally applies the night-shift operational minimum when a shiftType is provided.
 */
export function requiredBreakMinutes(
  workedHours: number,
  rule: BreakRule,
  shiftType?: string,
): number {
  const requiredByThreshold = rule.thresholds
    .filter((threshold) => workedHours >= threshold.workedHoursMin)
    .reduce((minutes, threshold) => Math.max(minutes, threshold.requiredBreakMinutes), 0);

  if (shiftType && shiftType.toUpperCase() === SHIFT_TYPE_NIGHT) {
    return Math.max(requiredByThreshold, NIGHT_SHIFT_MIN_BREAK_MINUTES);
  }

  return requiredByThreshold;
}
