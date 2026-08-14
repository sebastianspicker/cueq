import type { CoreClosingContract } from '@cueq/shared';
import type { ChecklistItem, ChecklistSeverity } from '../types.js';

export type ClosingChecklistInput = CoreClosingContract['checklistInput'];

export type ClosingChecklistResult = Omit<CoreClosingContract['checklistOutput'], 'items'> & {
  items: ChecklistItem[];
};

function severityFor(count: number, errorByDefault = false): ChecklistSeverity {
  if (count === 0) {
    return 'INFO';
  }

  return errorByDefault ? 'ERROR' : 'WARNING';
}

function statusFor(count: number): ChecklistItem['status'] {
  return count === 0 ? 'RESOLVED' : 'OPEN';
}

/**
 * Generate a compliance checklist for a monthly closing period.
 *
 * Evaluates missing bookings, gaps, open corrections/leave, rule violations,
 * roster mismatches, and balance anomalies. Each item is classified as
 * INFO, WARNING, or ERROR to guide the HR review process.
 */
export function generateClosingChecklist(input: ClosingChecklistInput): ClosingChecklistResult {
  const items: ChecklistItem[] = [
    {
      code: 'MISSING_BOOKINGS',
      label: 'Missing bookings',
      severity: severityFor(input.missingBookings, true),
      status: statusFor(input.missingBookings),
      details: `${input.missingBookings} days with no booking and no absence`,
    },
    {
      code: 'BOOKING_GAPS',
      label: 'Booking gaps',
      severity: severityFor(input.bookingGaps),
      status: statusFor(input.bookingGaps),
      details: `${input.bookingGaps} oversized booking gaps detected`,
    },
    {
      code: 'OPEN_CORRECTIONS',
      label: 'Open correction requests',
      severity: severityFor(input.openCorrectionRequests, true),
      status: statusFor(input.openCorrectionRequests),
      details: `${input.openCorrectionRequests} corrections still open`,
    },
    {
      code: 'OPEN_LEAVE',
      label: 'Open leave requests',
      severity: severityFor(input.openLeaveRequests),
      status: statusFor(input.openLeaveRequests),
      details: `${input.openLeaveRequests} leave approvals pending`,
    },
    {
      code: 'RULE_VIOLATIONS',
      label: 'Rule violations',
      severity: severityFor(input.ruleViolations, true),
      status: statusFor(input.ruleViolations),
      details: `${input.ruleViolations} unresolved policy ${input.ruleViolations === 1 ? 'violation' : 'violations'}`,
    },
    {
      code: 'ROSTER_MISMATCHES',
      label: 'Roster mismatches',
      severity: severityFor(input.rosterMismatches),
      status: statusFor(input.rosterMismatches),
      details: `${input.rosterMismatches} plan-vs-actual mismatches`,
    },
    {
      code: 'BALANCE_ANOMALIES',
      label: 'Balance anomalies',
      severity: severityFor(input.balanceAnomalies),
      status: statusFor(input.balanceAnomalies),
      details: `${input.balanceAnomalies} balances outside configured bounds`,
    },
  ];

  return {
    items,
    hasErrors: items.some((item) => item.severity === 'ERROR' && item.status !== 'RESOLVED'),
  };
}
