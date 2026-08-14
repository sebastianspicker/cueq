import type { RuleViolation } from '../types.js';
import { toViolation } from '../utils.js';

export type ClosingStatus = 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';

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
  switch (input.action) {
    case 'ADVANCE_TO_REVIEW':
      return CLOSING_ACTION_HANDLERS.ADVANCE_TO_REVIEW(input);
    case 'APPROVE':
      return CLOSING_ACTION_HANDLERS.APPROVE(input);
    case 'EXPORT':
      return CLOSING_ACTION_HANDLERS.EXPORT(input);
    case 'REOPEN':
      return CLOSING_ACTION_HANDLERS.REOPEN(input);
    case 'POST_CLOSE_CORRECTION':
      return CLOSING_ACTION_HANDLERS.POST_CLOSE_CORRECTION(input);
    default:
      return rejected(input, 'UNSUPPORTED_ACTION', 'Unsupported closing action.');
  }
}
