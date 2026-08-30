/** Injectable provider for workflow runtime operations. */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, WorkflowInstance, WorkflowPolicy, WorkflowType } from '@cueq/database';
import type {
  WorkflowAction,
  WorkflowDecisionCommand,
  WorkflowInboxQuery,
  WorkflowPolicyUpsert,
} from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { WorkflowAssignmentHelper } from './workflow-assignment.helper.js';
import { WorkflowDelegationCrudHelper } from './workflow-delegation-crud.helper.js';
import { availableWorkflowActions, normalizeWorkflowAction } from './workflow-action-visibility.js';
import * as operations from './workflow-runtime-operations.js';
import {
  getWorkflowDetail,
  listWorkflowInbox,
  type VisibleWorkflow,
} from './workflow-runtime-query.js';
import type {
  WorkflowActor,
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
} from './workflow-contracts.js';

export type {
  WorkflowActor,
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
} from './workflow-contracts.js';

@Injectable()
export class WorkflowRuntimeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WorkflowAssignmentHelper) private readonly assignmentHelper: WorkflowAssignmentHelper,
    @Inject(WorkflowDelegationCrudHelper)
    private readonly delegationCrud: WorkflowDelegationCrudHelper,
  ) {}

  normalizeAction(command: WorkflowDecisionCommand): WorkflowAction {
    return normalizeWorkflowAction(command);
  }

  availableActions(workflow: WorkflowInstance, actor: WorkflowActor): WorkflowAction[] {
    return availableWorkflowActions(workflow, actor);
  }

  async listInbox(actor: WorkflowActor, query: WorkflowInboxQuery): Promise<VisibleWorkflow[]> {
    return listWorkflowInbox(this.prisma, actor, query);
  }

  async getDetail(actor: WorkflowActor, workflowId: string): Promise<VisibleWorkflow> {
    return getWorkflowDetail(this.prisma, actor, workflowId);
  }

  async buildWorkflowAssignment(
    input: WorkflowAssignmentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<WorkflowAssignmentResult> {
    return operations.buildWorkflowAssignment(this.dependencies(), input, tx);
  }

  async listPolicies(): Promise<WorkflowPolicy[]> {
    return operations.listWorkflowPolicies(this.dependencies());
  }

  async getPolicy(type: WorkflowType): Promise<WorkflowPolicy | null> {
    return operations.getWorkflowPolicy(this.dependencies(), type);
  }

  async listPolicyHistory(
    type: WorkflowType,
  ): Promise<{ entries: WorkflowPolicy[]; total: number }> {
    return operations.listWorkflowPolicyHistory(this.dependencies(), type);
  }

  async upsertPolicy(
    type: WorkflowType,
    payload: WorkflowPolicyUpsert,
    actorId?: string,
  ): Promise<WorkflowPolicy> {
    return operations.upsertWorkflowPolicy(this.dependencies(), type, payload, actorId);
  }

  async escalateOverdueWorkflows(now = new Date()) {
    return operations.escalateOverdueWorkflows(this.dependencies(), now);
  }

  async listDelegations(query: { delegatorId?: string; workflowType?: WorkflowType }) {
    return operations.listWorkflowDelegations(this.dependencies(), query);
  }

  async createDelegation(
    actorId: string,
    payload: Parameters<WorkflowDelegationCrudHelper['createDelegation']>[1],
  ) {
    return operations.createWorkflowDelegation(this.dependencies(), actorId, payload);
  }

  async updateDelegation(
    actorId: string,
    id: string,
    payload: Parameters<WorkflowDelegationCrudHelper['updateDelegation']>[2],
  ) {
    return operations.updateWorkflowDelegation(this.dependencies(), actorId, id, payload);
  }

  async deleteDelegation(actorId: string, id: string) {
    return operations.deleteWorkflowDelegation(this.dependencies(), actorId, id);
  }

  private dependencies(): WorkflowRuntimeDependencies {
    return {
      assignmentHelper: this.assignmentHelper,
      delegationCrud: this.delegationCrud,
    };
  }
}

export type WorkflowRuntimeDependencies = {
  assignmentHelper: WorkflowAssignmentHelper;
  delegationCrud: WorkflowDelegationCrudHelper;
};
