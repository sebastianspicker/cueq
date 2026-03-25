import type { Prisma, WorkflowInstance, WorkflowPolicy } from '@cueq/database';
import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import type { WorkflowAction } from '@cueq/shared';

/* ── Constants ──────────────────────────────────────────── */

export const TYPE_ROLE_MATRIX: Record<WorkflowType, Role[]> = {
  [WorkflowType.LEAVE_REQUEST]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
  [WorkflowType.BOOKING_CORRECTION]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
  [WorkflowType.POST_CLOSE_CORRECTION]: [Role.HR, Role.ADMIN],
  [WorkflowType.SHIFT_SWAP]: [Role.SHIFT_PLANNER, Role.HR, Role.ADMIN],
  [WorkflowType.OVERTIME_APPROVAL]: [Role.TEAM_LEAD, Role.HR, Role.ADMIN],
};

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

export interface WorkflowActor {
  id: string;
  role: Role;
  organizationUnitId: string;
}

export interface WorkflowAssignmentInput {
  type: WorkflowType;
  requesterId: string;
  requesterOrganizationUnitId: string;
  preferredApproverId?: string;
  requestedAt?: Date;
}

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

export interface WorkflowDecisionResult {
  action: WorkflowAction;
  previous: WorkflowInstance;
  updated: WorkflowInstance;
}

/* ── Free Functions ─────────────────────────────────────── */

export function toIso(date: Date): string {
  return date.toISOString();
}

export function addHours(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}

export function asRoleArray(value: Prisma.JsonValue | null | undefined): Role[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is Role => {
    return typeof candidate === 'string' && Object.values(Role).includes(candidate as Role);
  });
}

export function appendTrail(trail: Prisma.JsonValue | null, approverId?: string | null): string[] {
  const normalized = Array.isArray(trail)
    ? trail.filter((value): value is string => typeof value === 'string')
    : [];
  if (approverId && !normalized.includes(approverId)) {
    normalized.push(approverId);
  }
  return normalized;
}

export function isWorkflowFinal(status: WorkflowStatus): boolean {
  return (
    status === WorkflowStatus.APPROVED ||
    status === WorkflowStatus.REJECTED ||
    status === WorkflowStatus.CANCELLED
  );
}

export function isRoleAllowedForType(role: Role, type: WorkflowType): boolean {
  return TYPE_ROLE_MATRIX[type].includes(role);
}

export function isRoleAllowedForAllWorkflowTypes(role: Role): boolean {
  return (Object.values(WorkflowType) as WorkflowType[]).every((type) =>
    isRoleAllowedForType(role, type),
  );
}
