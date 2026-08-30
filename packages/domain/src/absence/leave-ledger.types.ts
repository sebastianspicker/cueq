export interface LeaveQuotaInput {
  year: number;
  employmentFraction: number;
  entryDate?: string;
  exitDate?: string;
  usedDays: number;
  carryOverDays?: number;
  asOfDate: string;
}

export interface LeaveQuotaResult {
  entitlementDays: number;
  carriedOverDays: number;
  forfeitedDays: number;
  remainingDays: number;
}

export interface LeaveUsageEntry {
  date: string;
  days: number;
}

export interface LeaveAdjustmentEntry {
  year: number;
  deltaDays: number;
}

export interface LeaveLedgerInput {
  year: number;
  asOfDate: string;
  workTimeModelWeeklyHours: number;
  employmentStartDate?: string;
  employmentEndDate?: string;
  priorYearCarryOverDays?: number;
  annualLeaveUsage?: LeaveUsageEntry[];
  adjustments?: LeaveAdjustmentEntry[];
}

export interface LeaveLedgerResult extends LeaveQuotaResult {
  usedDays: number;
  carriedOverUsedDays: number;
  carriedOverRemainingDays: number;
  adjustmentsDays: number;
  currentYearUsedDays: number;
}
