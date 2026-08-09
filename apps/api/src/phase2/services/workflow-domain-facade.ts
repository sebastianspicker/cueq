/** Compatibility implementation for the injectable workflow-domain provider. */
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { ClosingLockHelper } from '../helpers/closing-lock.helper.js';
import type { PersonHelper } from '../helpers/person.helper.js';
import type { WorkflowCreationHelper } from '../helpers/workflow-creation.helper.js';
import type { WorkflowSideEffectsHelper } from '../helpers/workflow-side-effects.helper.js';
import type { WorkflowRuntimeService } from '../workflow-runtime.service.js';
import { decideWorkflowSubmission } from './workflow-domain-decision.js';
import * as submissions from './workflow-domain-submissions.js';
import * as queries from './workflow-domain-queries.js';

export type WorkflowDomainDependencies = {
  prisma: PrismaService;
  personHelper: PersonHelper;
  workflowRuntimeService: WorkflowRuntimeService;
  creationHelper: WorkflowCreationHelper;
  sideEffectsHelper: WorkflowSideEffectsHelper;
  closingLockHelper: ClosingLockHelper;
};

export class WorkflowsDomainFacade {
  constructor(private readonly dependencies: WorkflowDomainDependencies) {}

  async createBookingCorrection(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.dependencies.creationHelper.createBookingCorrection(user, payload);
  }

  async createShiftSwapWorkflow(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.dependencies.creationHelper.createShiftSwapWorkflow(user, payload);
  }

  async createOvertimeApprovalWorkflow(
    user: AuthenticatedIdentity,
    payload: unknown,
  ): Promise<unknown> {
    return this.dependencies.creationHelper.createOvertimeApprovalWorkflow(user, payload);
  }

  async workflowInbox(user: AuthenticatedIdentity, query?: unknown): Promise<unknown> {
    return queries.workflowInboxQuery(this.collaborators(), user, query);
  }

  async workflowDetail(user: AuthenticatedIdentity, workflowId: string): Promise<unknown> {
    return queries.workflowDetailQuery(this.collaborators(), user, workflowId);
  }

  async listWorkflowPolicies(user: AuthenticatedIdentity): Promise<unknown> {
    return queries.listWorkflowPoliciesQuery(this.collaborators(), user);
  }

  async getWorkflowPolicy(user: AuthenticatedIdentity, type: string): Promise<unknown> {
    return queries.workflowPolicyQuery(this.collaborators(), user, type);
  }

  async listWorkflowPolicyHistory(user: AuthenticatedIdentity, type: string): Promise<unknown> {
    return queries.workflowPolicyHistoryQuery(this.collaborators(), user, type);
  }

  async upsertWorkflowPolicy(
    user: AuthenticatedIdentity,
    type: string,
    payload: unknown,
  ): Promise<unknown> {
    return submissions.upsertWorkflowPolicySubmission(this.collaborators(), user, type, payload);
  }

  async listWorkflowDelegations(
    user: AuthenticatedIdentity,
    query: { delegatorId?: string; workflowType?: string },
  ): Promise<unknown> {
    return queries.workflowDelegationsQuery(this.collaborators(), user, query);
  }

  async createWorkflowDelegation(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return submissions.createWorkflowDelegationSubmission(this.collaborators(), user, payload);
  }

  async updateWorkflowDelegation(
    user: AuthenticatedIdentity,
    id: string,
    payload: unknown,
  ): Promise<unknown> {
    return submissions.updateWorkflowDelegationSubmission(this.collaborators(), user, id, payload);
  }

  async deleteWorkflowDelegation(user: AuthenticatedIdentity, id: string): Promise<unknown> {
    return submissions.deleteWorkflowDelegationSubmission(this.collaborators(), user, id);
  }

  async decideWorkflow(
    user: AuthenticatedIdentity,
    workflowId: string,
    payload: unknown,
  ): Promise<unknown> {
    return decideWorkflowSubmission(this.collaborators(), user, workflowId, payload);
  }

  private collaborators() {
    const { creationHelper: _creationHelper, ...collaborators } = this.dependencies;
    return collaborators;
  }
}
