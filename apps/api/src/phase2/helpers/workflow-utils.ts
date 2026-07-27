/** Defines shared workflow routing defaults and pure state-normalization utilities. */
import type { Prisma, WorkflowInstance, WorkflowPolicy } from '@cueq/database';
import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import type { WorkflowAction } from '@cueq/shared';

/* ── Constants ──────────────────────────────────────────── */

const TYPE_ROLE_MATRIX: Record<WorkflowType, Role[]> = {
  [WorkflowType.LEAVE_REQUEST]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
  [WorkflowType.BOOKING_CORRECTION]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
  [WorkflowType.POST_CLOSE_CORRECTION]: [Role.HR, Role.ADMIN],
  [WorkflowType.SHIFT_SWAP]: [Role.SHIFT_PLANNER, Role.HR, Role.ADMIN],
  [WorkflowType.OVERTIME_APPROVAL]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
};

/** Fallback routing policies created when a workflow type has no active persisted policy. */
export const DEFAULT_POLICIES: Record<
  WorkflowType,
  {
    escalationDeadlineHours: number;
    escalationRoles: Role[];
    maxDelegationDepth: number;
  }
> = {
  [WorkflowType.LEAVE_REQUEST]: {
    escalationDeadlineHours: 48,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
  [WorkflowType.BOOKING_CORRECTION]: {
    escalationDeadlineHours: 48,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
  [WorkflowType.POST_CLOSE_CORRECTION]: {
    escalationDeadlineHours: 24,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
  [WorkflowType.SHIFT_SWAP]: {
    escalationDeadlineHours: 48,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
  [WorkflowType.OVERTIME_APPROVAL]: {
    escalationDeadlineHours: 48,
    escalationRoles: [Role.HR, Role.ADMIN],
    maxDelegationDepth: 5,
  },
};

/* ── Interfaces ─────────────────────────────────────────── */

/** Authenticated actor context needed by workflow routing and decision helpers. */
export interface WorkflowActor {
  id: string;
  role: Role;
  organizationUnitId: string;
}

/** Inputs used to resolve an approver and effective workflow policy. */
export interface WorkflowAssignmentInput {
  type: WorkflowType;
  requesterId: string;
  requesterOrganizationUnitId: string;
  preferredApproverId?: string;
  requestedAt?: Date;
}

/** Normalized routing result persisted with a newly submitted workflow. */
export interface WorkflowAssignmentResult {
  status: WorkflowStatus;
  approverId: string | null;
  submittedAt: Date;
  dueAt: Date | null;
  escalationLevel: number;
  delegationTrail: string[];
  traversedApprovers: string[];
  escalated: boolean;
  policy: WorkflowPolicy;
}

/** Before/after state returned by an applied workflow decision. */
export interface WorkflowDecisionResult {
  action: WorkflowAction;
  previous: WorkflowInstance;
  updated: WorkflowInstance;
}

/* ── Free Functions ─────────────────────────────────────── */

/** Serializes workflow timestamps consistently for API and audit payloads. */
export function toIso(date: Date): string {
  return date.toISOString();
}

/** Advances a workflow deadline by the policy's hour interval. */
export function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}

/** Normalizes stored JSON role arrays while dropping unknown or malformed values. */
export function asRoleArray(value: Prisma.JsonValue | null | undefined): Role[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is Role => {
    return typeof candidate === 'string' && Object.values(Role).includes(candidate as Role);
  });
}

/** Appends an approver once while normalizing a persisted delegation trail. */
export function appendTrail(trail: Prisma.JsonValue | null, approverId?: string | null): string[] {
  const normalized = Array.isArray(trail)
    ? trail.filter((value): value is string => typeof value === 'string')
    : [];
  if (approverId && !normalized.includes(approverId)) {
    normalized.push(approverId);
  }
  return normalized;
}

/** Identifies terminal workflow states that must not accept further decisions. */
export function isWorkflowFinal(status: WorkflowStatus): boolean {
  return (
    status === WorkflowStatus.APPROVED ||
    status === WorkflowStatus.REJECTED ||
    status === WorkflowStatus.CANCELLED
  );
}

/** Checks the explicit approver-role matrix for one workflow type. */
export function isRoleAllowedForType(role: Role, type: WorkflowType): boolean {
  return TYPE_ROLE_MATRIX[type].includes(role);
}

/** Checks whether a role can approve every supported workflow type. */
export function isRoleAllowedForAllWorkflowTypes(role: Role): boolean {
  return (Object.values(WorkflowType) as WorkflowType[]).every((type) =>
    isRoleAllowedForType(role, type),
  );
}
