/** Defines workflow-type approval and fallback-routing policy. */
import { Role, WorkflowType } from '@cueq/database';

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
  { escalationDeadlineHours: number; escalationRoles: Role[]; maxDelegationDepth: number }
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
