import type { RuleViolation } from '../types.js';
import { toViolation } from '../utils.js';

export type RosterStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';

export type RosterAction = 'PUBLISH' | 'CLOSE' | 'REVERT_TO_DRAFT';

export interface RosterTransitionInput {
  currentStatus: RosterStatus;
  action: RosterAction;
  checklistHasErrors: boolean;
}

export interface RosterTransitionResult {
  nextStatus: RosterStatus;
  violations: RuleViolation[];
}

/**
 * Roster state machine: DRAFT → PUBLISHED → CLOSED.
 *
 * PUBLISH requires no checklist errors (min staffing violations etc.).
 * CLOSE is only valid from PUBLISHED.
 * REVERT_TO_DRAFT goes back to DRAFT from PUBLISHED only.
 */
export function advanceRosterStatus(input: RosterTransitionInput): RosterTransitionResult {
  const violations: RuleViolation[] = [];

  if (input.action === 'PUBLISH') {
    if (input.currentStatus !== 'DRAFT') {
      violations.push(
        toViolation({
          code: 'INVALID_TRANSITION',
          message: 'Can only publish from DRAFT.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    if (input.checklistHasErrors) {
      violations.push(
        toViolation({
          code: 'CHECKLIST_NOT_GREEN',
          message: 'Cannot publish roster with unresolved staffing violations.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'PUBLISHED', violations };
  }

  if (input.action === 'CLOSE') {
    if (input.currentStatus !== 'PUBLISHED') {
      violations.push(
        toViolation({
          code: 'INVALID_TRANSITION',
          message: 'Can only close from PUBLISHED.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'CLOSED', violations };
  }

  if (input.action === 'REVERT_TO_DRAFT') {
    if (input.currentStatus !== 'PUBLISHED') {
      violations.push(
        toViolation({
          code: 'INVALID_TRANSITION',
          message: 'Can only revert to draft from PUBLISHED.',
        }),
      );
      return { nextStatus: input.currentStatus, violations };
    }

    return { nextStatus: 'DRAFT', violations };
  }

  return {
    nextStatus: input.currentStatus,
    violations: [
      toViolation({
        code: 'UNSUPPORTED_ACTION',
        message: 'Unsupported roster action.',
      }),
    ],
  };
}
