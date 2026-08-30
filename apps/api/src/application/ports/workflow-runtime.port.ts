/** Narrow application boundary for workflow-assignment resolution. */
import type { Prisma, WorkflowPolicy, WorkflowType } from '@cueq/database';
import type { WorkflowStatus } from '@cueq/database';

/** Injection token for the workflow-assignment application boundary. */
export const WORKFLOW_RUNTIME_PORT = Symbol('WORKFLOW_RUNTIME_PORT');

/** Input required to resolve an approver and effective workflow policy. */
export interface WorkflowAssignmentRequest {
  type: WorkflowType;
  requesterId: string;
  requesterOrganizationUnitId: string;
  preferredApproverId?: string;
  requestedAt?: Date;
}

/** Assignment persisted with a newly-created workflow instance. */
export interface WorkflowAssignment {
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

/** Workflow capability needed by absence and closing orchestration. */
export interface WorkflowRuntimePort {
  buildWorkflowAssignment(
    input: WorkflowAssignmentRequest,
    tx?: Prisma.TransactionClient,
  ): Promise<WorkflowAssignment>;
}
