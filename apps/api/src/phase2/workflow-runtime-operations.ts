import type { WorkflowPolicy, WorkflowType } from '@cueq/database';
import type { WorkflowPolicyUpsert } from '@cueq/shared';
import type { Prisma } from '@cueq/database';
import type { WorkflowAssignmentHelper } from './helpers/workflow-assignment.helper.js';
import type { WorkflowDelegationCrudHelper } from './helpers/workflow-delegation-crud.helper.js';
import type {
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
} from './helpers/workflow-utils.js';

type WorkflowRuntimeOperations = {
  assignmentHelper: WorkflowAssignmentHelper;
  delegationCrud: WorkflowDelegationCrudHelper;
};

export function buildWorkflowAssignment(
  { assignmentHelper }: WorkflowRuntimeOperations,
  input: WorkflowAssignmentInput,
  tx?: Prisma.TransactionClient,
): Promise<WorkflowAssignmentResult> {
  return assignmentHelper.buildWorkflowAssignment(input, tx);
}

export function listWorkflowPolicies({
  assignmentHelper,
}: WorkflowRuntimeOperations): Promise<WorkflowPolicy[]> {
  return assignmentHelper.listPolicies();
}

export function getWorkflowPolicy(
  { assignmentHelper }: WorkflowRuntimeOperations,
  type: WorkflowType,
): Promise<WorkflowPolicy | null> {
  return assignmentHelper.getPolicy(type);
}

export function listWorkflowPolicyHistory(
  { assignmentHelper }: WorkflowRuntimeOperations,
  type: WorkflowType,
): Promise<{ entries: WorkflowPolicy[]; total: number }> {
  return assignmentHelper.listPolicyHistory(type);
}

export function upsertWorkflowPolicy(
  { assignmentHelper }: WorkflowRuntimeOperations,
  type: WorkflowType,
  payload: WorkflowPolicyUpsert,
  actorId?: string,
): Promise<WorkflowPolicy> {
  return assignmentHelper.upsertPolicy(type, payload, actorId);
}

export function escalateOverdueWorkflows(
  { assignmentHelper }: WorkflowRuntimeOperations,
  now = new Date(),
) {
  return assignmentHelper.escalateOverdueWorkflows(now);
}

export function listWorkflowDelegations(
  { delegationCrud }: WorkflowRuntimeOperations,
  query: { delegatorId?: string; workflowType?: WorkflowType },
) {
  return delegationCrud.listDelegations(query);
}

export function createWorkflowDelegation(
  { delegationCrud }: WorkflowRuntimeOperations,
  actorId: string,
  payload: Parameters<WorkflowDelegationCrudHelper['createDelegation']>[1],
) {
  return delegationCrud.createDelegation(actorId, payload);
}

export function updateWorkflowDelegation(
  { delegationCrud }: WorkflowRuntimeOperations,
  actorId: string,
  id: string,
  payload: Parameters<WorkflowDelegationCrudHelper['updateDelegation']>[2],
) {
  return delegationCrud.updateDelegation(actorId, id, payload);
}

export function deleteWorkflowDelegation(
  { delegationCrud }: WorkflowRuntimeOperations,
  actorId: string,
  id: string,
) {
  return delegationCrud.deleteDelegation(actorId, id);
}
