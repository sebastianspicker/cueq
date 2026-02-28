import type { RuleViolation } from '../types';
import type { CoreWorkflowTransitionContract } from '@cueq/shared';
import { toIso, toViolation } from '../utils';

export type WorkflowStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'CANCELLED';

export type WorkflowDecision = 'APPROVE' | 'REJECT' | 'ESCALATE' | 'CANCEL';

export type TransitionWorkflowInput = CoreWorkflowTransitionContract['input'] & {
  currentStatus: WorkflowStatus;
  decision: WorkflowDecision;
  at?: string;
};

export type TransitionWorkflowResult = Omit<
  CoreWorkflowTransitionContract['output'],
  'violations'
> & {
  nextStatus: WorkflowStatus;
  violations: RuleViolation[];
};

const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  PENDING: ['APPROVED', 'REJECTED', 'ESCALATED', 'CANCELLED'],
  ESCALATED: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

const DECISION_TO_STATUS: Record<WorkflowDecision, WorkflowStatus> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  ESCALATE: 'ESCALATED',
  CANCEL: 'CANCELLED',
};

export function transitionWorkflow(input: TransitionWorkflowInput): TransitionWorkflowResult {
  const nextStatus = DECISION_TO_STATUS[input.decision];
  const allowed = ALLOWED_TRANSITIONS[input.currentStatus];

  if (!allowed.includes(nextStatus)) {
    return {
      ok: false,
      nextStatus: input.currentStatus,
      decidedAt: input.at ?? toIso(),
      violations: [
        toViolation({
          code: 'INVALID_TRANSITION',
          message: `Transition ${input.currentStatus} -> ${nextStatus} is not allowed.`,
          context: {
            workflowId: input.workflowId,
            actorId: input.actorId,
            reason: input.reason,
          },
        }),
      ],
    };
  }

  return {
    ok: true,
    nextStatus,
    decidedAt: input.at ?? toIso(),
    violations: [],
  };
}

export interface DelegationCandidate {
  approverId: string;
  isAvailable: boolean;
  activeFrom?: string;
  activeTo?: string;
}

export interface ResolveDelegationInput {
  requesterId: string;
  primaryApproverId: string;
  fallbackChain: DelegationCandidate[];
  at: string;
}

export interface ResolveDelegationResult {
  approverId: string;
  escalated: boolean;
  traversed: string[];
}

function isActiveAt(candidate: DelegationCandidate, at: Date): boolean {
  if (!candidate.activeFrom && !candidate.activeTo) {
    return true;
  }

  const from = candidate.activeFrom
    ? new Date(candidate.activeFrom)
    : new Date('1970-01-01T00:00:00.000Z');
  const to = candidate.activeTo
    ? new Date(candidate.activeTo)
    : new Date('9999-12-31T23:59:59.999Z');
  return at >= from && at <= to;
}

export function resolveDelegation(input: ResolveDelegationInput): ResolveDelegationResult {
  const at = new Date(input.at);
  const traversed = [input.primaryApproverId];

  for (const candidate of input.fallbackChain) {
    traversed.push(candidate.approverId);

    if (
      candidate.approverId !== input.requesterId &&
      candidate.isAvailable &&
      isActiveAt(candidate, at)
    ) {
      return {
        approverId: candidate.approverId,
        escalated: candidate.approverId !== input.primaryApproverId,
        traversed,
      };
    }
  }

  return {
    approverId: input.primaryApproverId,
    escalated: false,
    traversed,
  };
}

export interface EscalationInput {
  currentStatus: WorkflowStatus;
  submittedAt: string;
  now: string;
  escalationDeadlineHours: number;
}

export function shouldEscalate(input: EscalationInput): boolean {
  if (input.currentStatus !== 'PENDING') {
    return false;
  }

  const submitted = new Date(input.submittedAt).getTime();
  const now = new Date(input.now).getTime();
  const elapsedHours = (now - submitted) / 3_600_000;
  return elapsedHours >= input.escalationDeadlineHours;
}
