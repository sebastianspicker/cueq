import type { WorkflowType } from '@cueq/database';
import {
  CreateWorkflowDelegationRuleSchema,
  UpdateWorkflowDelegationRuleSchema,
  WorkflowPolicyUpsertSchema,
  WorkflowTypeSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { assertHrLikeRole } from '../helpers/role-constants.js';
import type { WorkflowDomainCollaborators } from './workflow-domain-queries.js';

export async function upsertWorkflowPolicySubmission(
  collaborators: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  type: string,
  payload: unknown,
): Promise<unknown> {
  const { personHelper, workflowRuntimeService: runtime } = collaborators;
  assertHrLikeRole(user);
  const actor = await personHelper.personForUser(user);
  const parsedType = WorkflowTypeSchema.parse(type);
  const parsedPayload = WorkflowPolicyUpsertSchema.parse(payload);
  return runtime.upsertPolicy(parsedType as WorkflowType, parsedPayload, actor.id);
}

export async function createWorkflowDelegationSubmission(
  collaborators: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  payload: unknown,
): Promise<unknown> {
  const { personHelper, workflowRuntimeService: runtime } = collaborators;
  assertHrLikeRole(user);
  const actor = await personHelper.personForUser(user);
  const parsed = CreateWorkflowDelegationRuleSchema.parse(payload);
  return runtime.createDelegation(actor.id, {
    delegatorId: parsed.delegatorId,
    delegateId: parsed.delegateId,
    workflowType: parsed.workflowType as WorkflowType | undefined,
    organizationUnitId: parsed.organizationUnitId,
    activeFrom: parsed.activeFrom,
    activeTo: parsed.activeTo,
    isActive: parsed.isActive,
    priority: parsed.priority,
  });
}

export async function updateWorkflowDelegationSubmission(
  collaborators: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  id: string,
  payload: unknown,
): Promise<unknown> {
  const { personHelper, workflowRuntimeService: runtime } = collaborators;
  assertHrLikeRole(user);
  const actor = await personHelper.personForUser(user);
  const parsed = UpdateWorkflowDelegationRuleSchema.parse(payload);
  return runtime.updateDelegation(actor.id, id, {
    delegateId: parsed.delegateId,
    workflowType: parsed.workflowType as WorkflowType | null | undefined,
    organizationUnitId: parsed.organizationUnitId,
    activeFrom: parsed.activeFrom,
    activeTo: parsed.activeTo,
    isActive: parsed.isActive,
    priority: parsed.priority,
  });
}

export async function deleteWorkflowDelegationSubmission(
  collaborators: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  id: string,
): Promise<unknown> {
  const { personHelper, workflowRuntimeService: runtime } = collaborators;
  assertHrLikeRole(user);
  const actor = await personHelper.personForUser(user);
  await runtime.deleteDelegation(actor.id, id);
  return { deleted: true, id };
}
