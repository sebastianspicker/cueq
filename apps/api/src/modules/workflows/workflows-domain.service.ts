/** Injectable provider for actor-scoped workflow-domain operations. */
import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { PrismaService } from '../../persistence/prisma.service.js';
import { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import { PersonHelper } from '../people/public.js';
import { WorkflowCreationHelper } from './workflow-creation.helper.js';
import { WorkflowDecisionService } from './workflow-decision.service.js';
import { WorkflowSideEffectsHelper } from './workflow-side-effects.helper.js';
import { WorkflowRuntimeService } from './workflow-runtime.service.js';
import { decideWorkflowSubmission } from './workflow-domain-decision.js';
import * as queries from './workflow-domain-queries.js';
import * as submissions from './workflow-domain-submissions.js';

@Injectable()
export class WorkflowsDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
    @Inject(WorkflowCreationHelper) private readonly creationHelper: WorkflowCreationHelper,
    @Inject(WorkflowDecisionService)
    private readonly workflowDecisionService: WorkflowDecisionService,
    @Inject(WorkflowSideEffectsHelper)
    private readonly sideEffectsHelper: WorkflowSideEffectsHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
  ) {}

  async createBookingCorrection(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.creationHelper.createBookingCorrection(user, payload);
  }

  async createShiftSwapWorkflow(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    return this.creationHelper.createShiftSwapWorkflow(user, payload);
  }

  async createOvertimeApprovalWorkflow(
    user: AuthenticatedIdentity,
    payload: unknown,
  ): Promise<unknown> {
    return this.creationHelper.createOvertimeApprovalWorkflow(user, payload);
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

  private collaborators(): WorkflowDomainCollaborators {
    return {
      prisma: this.prisma,
      personHelper: this.personHelper,
      workflowRuntimeService: this.workflowRuntimeService,
      workflowDecisionService: this.workflowDecisionService,
      sideEffectsHelper: this.sideEffectsHelper,
      closingLockHelper: this.closingLockHelper,
    };
  }
}

type WorkflowDomainCollaborators = {
  prisma: PrismaService;
  personHelper: PersonHelper;
  workflowRuntimeService: WorkflowRuntimeService;
  workflowDecisionService: WorkflowDecisionService;
  sideEffectsHelper: WorkflowSideEffectsHelper;
  closingLockHelper: ClosingLockHelper;
};
