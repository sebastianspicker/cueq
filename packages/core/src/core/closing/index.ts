import type { CoreClosingContract } from '@cueq/shared';
import type { ChecklistItem, ChecklistSeverity, RuleViolation } from '../types';
import { toViolation } from '../utils';

export type ClosingStatus = 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';

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
      details: `${input.ruleViolations} unresolved policy violations`,
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

export interface CutoffTransitionInput {
  currentStatus: ClosingStatus;
  action: 'ADVANCE_TO_REVIEW' | 'APPROVE' | 'EXPORT' | 'REOPEN' | 'POST_CLOSE_CORRECTION';
  actorRole: 'EMPLOYEE' | 'TEAM_LEAD' | 'HR' | 'ADMIN';
  checklistHasErrors: boolean;
}

export interface CutoffTransitionResult {
  nextStatus: ClosingStatus;
  violations: RuleViolation[];
}

/**
 * Closing period state machine: OPEN → REVIEW → APPROVED → EXPORTED.
 *
 * Enforces valid transitions, role-based access (HR/Admin for reopen and
 * post-close correction), and blocks approval while checklist has errors.
 * Returns the next status and any transition violations.
 */
export function applyCutoffLock(input: CutoffTransitionInput): CutoffTransitionResult {
  const violations: RuleViolation[] = [];

  if (input.action === 'ADVANCE_TO_REVIEW') {
    if (input.currentStatus !== 'OPEN') {
      violations.push(
        toViolation({
          code: 'INVALID_CLOSING_TRANSITION',
          message: 'Can only advance to review from OPEN.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'REVIEW', violations };
  }

  if (input.action === 'APPROVE') {
    if (input.currentStatus !== 'REVIEW') {
      violations.push(
        toViolation({
          code: 'INVALID_CLOSING_TRANSITION',
          message: 'Can only approve from REVIEW.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    if (input.checklistHasErrors) {
      violations.push(
        toViolation({
          code: 'CHECKLIST_NOT_GREEN',
          message: 'Cannot approve while error checklist items are open.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'APPROVED', violations };
  }

  if (input.action === 'EXPORT') {
    if (input.currentStatus !== 'APPROVED') {
      violations.push(
        toViolation({
          code: 'INVALID_CLOSING_TRANSITION',
          message: 'Can only export from APPROVED.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'EXPORTED', violations };
  }

  if (input.action === 'REOPEN') {
    if (input.currentStatus !== 'REVIEW') {
      violations.push(
        toViolation({
          code: 'INVALID_CLOSING_TRANSITION',
          message: 'Can only re-open from REVIEW.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    if (input.actorRole !== 'HR' && input.actorRole !== 'ADMIN') {
      violations.push(
        toViolation({
          code: 'ROLE_FORBIDDEN',
          message: 'Only HR or Admin can re-open a closing period.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'OPEN', violations };
  }

  if (input.action === 'POST_CLOSE_CORRECTION') {
    if (input.currentStatus !== 'EXPORTED') {
      violations.push(
        toViolation({
          code: 'INVALID_CLOSING_TRANSITION',
          message: 'Post-close correction is only valid for EXPORTED periods.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    if (input.actorRole !== 'HR' && input.actorRole !== 'ADMIN') {
      violations.push(
        toViolation({
          code: 'ROLE_FORBIDDEN',
          message: 'Only HR or Admin can initiate post-close corrections.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'REVIEW', violations };
  }

  return {
    nextStatus: input.currentStatus,
    violations: [
      toViolation({
        code: 'UNSUPPORTED_ACTION',
        message: 'Unsupported closing action.',
      }),
    ],
  };
}
