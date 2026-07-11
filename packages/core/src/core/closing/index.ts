import { createHash } from 'node:crypto';
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

type ClosingAction = CutoffTransitionInput['action'];
type ClosingActionHandler = (input: CutoffTransitionInput) => CutoffTransitionResult;

function rejected(
  input: CutoffTransitionInput,
  code: string,
  message: string,
): CutoffTransitionResult {
  return {
    nextStatus: input.currentStatus,
    violations: [toViolation({ code, message })],
  };
}

function transitionFrom(
  input: CutoffTransitionInput,
  allowed: ClosingStatus[],
  nextStatus: ClosingStatus,
  message: string,
): CutoffTransitionResult {
  return allowed.includes(input.currentStatus)
    ? { nextStatus, violations: [] }
    : rejected(input, 'INVALID_CLOSING_TRANSITION', message);
}

function requireHrLike(
  input: CutoffTransitionInput,
  message: string,
): CutoffTransitionResult | null {
  return input.actorRole === 'HR' || input.actorRole === 'ADMIN'
    ? null
    : rejected(input, 'ROLE_FORBIDDEN', message);
}

const CLOSING_ACTION_HANDLERS: Record<ClosingAction, ClosingActionHandler> = {
  ADVANCE_TO_REVIEW: (input) =>
    transitionFrom(input, ['OPEN'], 'REVIEW', 'Can only advance to review from OPEN.'),
  APPROVE: (input) => {
    const transition = transitionFrom(
      input,
      ['REVIEW'],
      'APPROVED',
      'Can only approve from REVIEW.',
    );
    if (transition.violations.length > 0) return transition;
    return input.checklistHasErrors
      ? rejected(
          input,
          'CHECKLIST_NOT_GREEN',
          'Cannot approve while error checklist items are open.',
        )
      : transition;
  },
  EXPORT: (input) =>
    transitionFrom(input, ['APPROVED'], 'EXPORTED', 'Can only export from APPROVED.'),
  REOPEN: (input) => {
    const transition = transitionFrom(
      input,
      ['REVIEW', 'APPROVED'],
      'OPEN',
      'Can only re-open from REVIEW or APPROVED.',
    );
    if (transition.violations.length > 0) return transition;
    return requireHrLike(input, 'Only HR or Admin can re-open a closing period.') ?? transition;
  },
  POST_CLOSE_CORRECTION: (input) => {
    const transition = transitionFrom(
      input,
      ['EXPORTED'],
      'REVIEW',
      'Post-close correction is only valid for EXPORTED periods.',
    );
    if (transition.violations.length > 0) return transition;
    return (
      requireHrLike(input, 'Only HR or Admin can initiate post-close corrections.') ?? transition
    );
  },
};

/**
 * Closing period state machine: OPEN → REVIEW → APPROVED → EXPORTED.
 *
 * Enforces valid transitions, role-based access (HR/Admin for reopen and
 * post-close correction), and blocks approval while checklist has errors.
 * Returns the next status and any transition violations.
 */
export function applyCutoffLock(input: CutoffTransitionInput): CutoffTransitionResult {
  const handler = CLOSING_ACTION_HANDLERS[input.action];
  return handler
    ? handler(input)
    : rejected(input, 'UNSUPPORTED_ACTION', 'Unsupported closing action.');
}

// ── Export run idempotency ────────────────────────────────────────────

export interface ExportRunInput {
  periodId: string;
  periodStart: string;
  periodEnd: string;
  checklist: ClosingChecklistResult;
  data: unknown;
}

export interface ExportRunResult {
  checksum: string;
  periodId: string;
}

function canonicalizeForChecksum(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForChecksum(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalizeForChecksum((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

/**
 * Compute a deterministic checksum for an export run.
 * Same period + same data = same checksum, enabling idempotent exports.
 */
export function computeExportChecksum(input: ExportRunInput): ExportRunResult {
  const canonical = JSON.stringify(
    canonicalizeForChecksum({
      periodId: input.periodId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      checklist: input.checklist,
      data: input.data,
    }),
  );

  const checksum = createHash('sha256').update(canonical).digest('hex');

  return { checksum, periodId: input.periodId };
}
