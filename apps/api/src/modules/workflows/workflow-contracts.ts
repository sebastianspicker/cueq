/** Defines workflow operation inputs and results shared across application collaborators. */
import type { WorkflowInstance, WorkflowPolicy } from '@cueq/database';
import type { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import type { WorkflowAction } from '@cueq/contracts';

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
