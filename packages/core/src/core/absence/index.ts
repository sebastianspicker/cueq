/** Public entry point for pure absence, entitlement, and leave-ledger calculations. */
export { countWeekdaysInclusive, calculateAbsenceWorkingDays } from './working-days.js';
export type { AbsenceWorkingDaysInput } from './working-days.js';

export { calculateProratedMonthlyTarget } from './prorating.js';
export type { WorkSegment, ProratedTargetInput, ProratedTargetResult } from './prorating.js';

export { calculateLeaveLedger, calculateLeaveQuota } from './leave-ledger.js';
export type {
  LeaveQuotaInput,
  LeaveQuotaResult,
  LeaveUsageEntry,
  LeaveAdjustmentEntry,
  LeaveLedgerInput,
  LeaveLedgerResult,
} from './leave-ledger.js';
