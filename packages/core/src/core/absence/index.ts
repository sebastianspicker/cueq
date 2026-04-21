export { countWeekdaysInclusive, calculateAbsenceWorkingDays } from './working-days';
export type { AbsenceWorkingDaysInput } from './working-days';

export { calculateProratedMonthlyTarget } from './prorating';
export type { WorkSegment, ProratedTargetInput, ProratedTargetResult } from './prorating';

export { calculateLeaveLedger, calculateLeaveQuota } from './leave-ledger';
export type {
  LeaveQuotaInput,
  LeaveQuotaResult,
  LeaveUsageEntry,
  LeaveAdjustmentEntry,
  LeaveLedgerInput,
  LeaveLedgerResult,
} from './leave-ledger';
