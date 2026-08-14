/** Allocates leave usage to carry-over before current-year entitlement for deterministic balances. */
import { parseDateOrDateTime } from '@cueq/shared';
import { roundToTwo } from '../utils.js';
import type { LeaveUsageEntry } from './leave-ledger.types.js';

export interface CarryOverAllocation {
  carriedOverUsedDays: number;
  carriedOverRemainingDays: number;
  forfeitedDays: number;
}

/** Consume carry-over chronologically and forfeit only the amount left after its deadline. */
export function allocateCarryOverUsage(input: {
  usage: LeaveUsageEntry[];
  asOf: Date;
  deadline: Date;
  carriedOverDays: number;
  carryOverEnabled: boolean;
}): CarryOverAllocation {
  let carryRemaining = input.carriedOverDays;
  let carriedOverUsedDays = 0;
  let forfeitedDays = 0;
  let deadlineApplied = false;

  for (const entry of input.usage) {
    if (
      input.carryOverEnabled &&
      !deadlineApplied &&
      parseDateOrDateTime(entry.date) > input.deadline
    ) {
      forfeitedDays = roundToTwo(forfeitedDays + carryRemaining);
      carryRemaining = 0;
      deadlineApplied = true;
    }
    const fromCarry = Math.min(carryRemaining, entry.days);
    carryRemaining = roundToTwo(carryRemaining - fromCarry);
    carriedOverUsedDays = roundToTwo(carriedOverUsedDays + fromCarry);
  }

  if (input.carryOverEnabled && !deadlineApplied && input.asOf > input.deadline) {
    forfeitedDays = roundToTwo(forfeitedDays + carryRemaining);
    carryRemaining = 0;
  }
  return { carriedOverUsedDays, carriedOverRemainingDays: carryRemaining, forfeitedDays };
}
