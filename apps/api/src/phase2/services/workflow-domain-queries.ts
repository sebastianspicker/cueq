import type { WorkflowType } from '@cueq/database';
import { WorkflowInboxQuerySchema, WorkflowTypeSchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { PersonHelper } from '../helpers/person.helper.js';
import { assertHrLikeRole } from '../helpers/role-constants.js';
import type { WorkflowRuntimeService } from '../workflow-runtime.service.js';

export type WorkflowDomainCollaborators = {
  personHelper: PersonHelper;
  workflowRuntimeService: WorkflowRuntimeService;
};

export async function workflowInboxQuery(
  collaborators: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  query?: unknown,
): Promise<unknown> {
  const { personHelper, workflowRuntimeService: runtime } = collaborators;
  const person = await personHelper.personForUser(user);
  const parsed = WorkflowInboxQuerySchema.parse(query ?? {});
  return runtime.listInbox(
    { id: person.id, role: user.role, organizationUnitId: person.organizationUnitId },
    parsed,
  );
}

export async function workflowDetailQuery(
  collaborators: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  workflowId: string,
): Promise<unknown> {
  const { personHelper, workflowRuntimeService: runtime } = collaborators;
  const person = await personHelper.personForUser(user);
  return runtime.getDetail(
    { id: person.id, role: user.role, organizationUnitId: person.organizationUnitId },
    workflowId,
  );
}

export function listWorkflowPoliciesQuery(
  { workflowRuntimeService: runtime }: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
): Promise<unknown> {
  assertHrLikeRole(user);
  return runtime.listPolicies();
}

export function workflowPolicyQuery(
  { workflowRuntimeService: runtime }: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  type: string,
): Promise<unknown> {
  assertHrLikeRole(user);
  return runtime.getPolicy(WorkflowTypeSchema.parse(type) as WorkflowType);
}

export function workflowPolicyHistoryQuery(
  { workflowRuntimeService: runtime }: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  type: string,
): Promise<unknown> {
  assertHrLikeRole(user);
  return runtime.listPolicyHistory(WorkflowTypeSchema.parse(type) as WorkflowType);
}

export function workflowDelegationsQuery(
  { workflowRuntimeService: runtime }: WorkflowDomainCollaborators,
  user: AuthenticatedIdentity,
  query: { delegatorId?: string; workflowType?: string },
): Promise<unknown> {
  assertHrLikeRole(user);
  const workflowType = query.workflowType
    ? (WorkflowTypeSchema.parse(query.workflowType) as WorkflowType)
    : undefined;
  return runtime.listDelegations({ delegatorId: query.delegatorId, workflowType });
}
