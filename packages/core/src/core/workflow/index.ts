import type { RuleViolation } from '../types';
import type { CoreWorkflowTransitionContract } from '@cueq/shared';
import { toIso, toViolation } from '../utils';

export type WorkflowStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING'
  | 'ESCALATED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

export type WorkflowDecision = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'ESCALATE' | 'DELEGATE' | 'CANCEL';

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

const ALLOWED_DECISIONS: Record<WorkflowStatus, WorkflowDecision[]> = {
  DRAFT: ['SUBMIT', 'CANCEL'],
  SUBMITTED: ['SUBMIT', 'DELEGATE', 'CANCEL'],
  PENDING: ['APPROVE', 'REJECT', 'ESCALATE', 'DELEGATE', 'CANCEL'],
  ESCALATED: ['APPROVE', 'REJECT', 'DELEGATE', 'CANCEL'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

function resolveNextStatus(
  currentStatus: WorkflowStatus,
  decision: WorkflowDecision,
): WorkflowStatus {
  if (decision === 'DELEGATE') {
    return currentStatus;
  }

  if (decision === 'SUBMIT') {
    if (currentStatus === 'DRAFT') {
      return 'SUBMITTED';
    }

    if (currentStatus === 'SUBMITTED') {
      return 'PENDING';
    }
  }

  if (decision === 'ESCALATE' && currentStatus === 'PENDING') {
    return 'ESCALATED';
  }

  if (decision === 'APPROVE') {
    return 'APPROVED';
  }

  if (decision === 'REJECT') {
    return 'REJECTED';
  }

  if (decision === 'CANCEL') {
    return 'CANCELLED';
  }

  return currentStatus;
}

export function transitionWorkflow(input: TransitionWorkflowInput): TransitionWorkflowResult {
  const nextStatus = resolveNextStatus(input.currentStatus, input.decision);
  const allowed = ALLOWED_DECISIONS[input.currentStatus];

  if (
    !allowed.includes(input.decision) ||
    (nextStatus === input.currentStatus && input.decision !== 'DELEGATE')
  ) {
    return {
      ok: false,
      nextStatus: input.currentStatus,
      decidedAt: input.at ?? toIso(),
      violations: [
        toViolation({
          code: 'INVALID_TRANSITION',
          message: `Decision ${input.decision} from ${input.currentStatus} is not allowed.`,
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
  maxDepth?: number;
}

export interface ResolveDelegationResult {
  approverId: string;
  escalated: boolean;
  traversed: string[];
  cycleDetected: boolean;
  maxDepthReached: boolean;
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
  const maxDepth = Number.isFinite(input.maxDepth)
    ? Math.max(1, Math.trunc(input.maxDepth ?? 5))
    : 5;
  const traversed = [input.primaryApproverId];
  const visited = new Set<string>([input.primaryApproverId]);
  let cycleDetected = false;
  let maxDepthReached = false;

  for (const candidate of input.fallbackChain) {
    if (traversed.length >= maxDepth) {
      maxDepthReached = true;
      break;
    }

    if (visited.has(candidate.approverId)) {
      cycleDetected = true;
      continue;
    }

    traversed.push(candidate.approverId);
    visited.add(candidate.approverId);

    if (
      candidate.approverId !== input.requesterId &&
      candidate.isAvailable &&
      isActiveAt(candidate, at)
    ) {
      return {
        approverId: candidate.approverId,
        escalated: candidate.approverId !== input.primaryApproverId,
        traversed,
        cycleDetected,
        maxDepthReached,
      };
    }
  }

  return {
    approverId: input.primaryApproverId,
    escalated: false,
    traversed,
    cycleDetected,
    maxDepthReached,
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
