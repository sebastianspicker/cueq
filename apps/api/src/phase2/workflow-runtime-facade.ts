/** Compatibility implementation for the injectable workflow runtime provider. */
import type { Prisma, WorkflowInstance, WorkflowPolicy, WorkflowType } from '@cueq/database';
import type {
  WorkflowAction,
  WorkflowDecisionCommand,
  WorkflowInboxQuery,
  WorkflowPolicyUpsert,
} from '@cueq/shared';
import type { PrismaService } from '../persistence/prisma.service.js';
import type { AuditHelper } from './helpers/audit.helper.js';
import type { WorkflowAssignmentHelper } from './helpers/workflow-assignment.helper.js';
import type { WorkflowDelegationCrudHelper } from './helpers/workflow-delegation-crud.helper.js';
import type { WorkflowSideEffectsHelper } from './helpers/workflow-side-effects.helper.js';
import type {
  WorkflowActor,
  WorkflowAssignmentInput,
  WorkflowAssignmentResult,
  WorkflowDecisionResult,
} from './helpers/workflow-utils.js';
import { availableWorkflowActions, normalizeWorkflowAction } from './workflow-action-visibility.js';
import { decideWorkflowTransition } from './workflow-runtime-decision.js';
import * as operations from './workflow-runtime-operations.js';
import {
  getWorkflowDetail,
  listWorkflowInbox,
  type VisibleWorkflow,
} from './workflow-runtime-query.js';

export type WorkflowRuntimeDependencies = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
  assignmentHelper: WorkflowAssignmentHelper;
  delegationCrud: WorkflowDelegationCrudHelper;
  sideEffectsHelper: WorkflowSideEffectsHelper;
};

type CreateDelegationPayload = Parameters<WorkflowDelegationCrudHelper['createDelegation']>[1];
type UpdateDelegationPayload = Parameters<WorkflowDelegationCrudHelper['updateDelegation']>[2];

export class WorkflowRuntimeFacade {
  constructor(private readonly dependencies: WorkflowRuntimeDependencies) {}

  normalizeAction(command: WorkflowDecisionCommand): WorkflowAction {
    return normalizeWorkflowAction(command);
  }

  availableActions(workflow: WorkflowInstance, actor: WorkflowActor): WorkflowAction[] {
    return availableWorkflowActions(workflow, actor);
  }

  async listInbox(actor: WorkflowActor, query: WorkflowInboxQuery): Promise<VisibleWorkflow[]> {
    return listWorkflowInbox(this.dependencies.prisma, actor, query);
  }

  async getDetail(actor: WorkflowActor, workflowId: string): Promise<VisibleWorkflow> {
    return getWorkflowDetail(this.dependencies.prisma, actor, workflowId);
  }

  async decide(
    actor: WorkflowActor,
    command: WorkflowDecisionCommand,
    tx?: Prisma.TransactionClient,
  ): Promise<WorkflowDecisionResult> {
    return decideWorkflowTransition(this.dependencies, actor, command, tx);
  }

  async buildWorkflowAssignment(
    input: WorkflowAssignmentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<WorkflowAssignmentResult> {
    return operations.buildWorkflowAssignment(this.dependencies, input, tx);
  }

  async listPolicies(): Promise<WorkflowPolicy[]> {
    return operations.listWorkflowPolicies(this.dependencies);
  }

  async getPolicy(type: WorkflowType): Promise<WorkflowPolicy | null> {
    return operations.getWorkflowPolicy(this.dependencies, type);
  }

  async listPolicyHistory(
    type: WorkflowType,
  ): Promise<{ entries: WorkflowPolicy[]; total: number }> {
    return operations.listWorkflowPolicyHistory(this.dependencies, type);
  }

  async upsertPolicy(
    type: WorkflowType,
    payload: WorkflowPolicyUpsert,
    actorId?: string,
  ): Promise<WorkflowPolicy> {
    return operations.upsertWorkflowPolicy(this.dependencies, type, payload, actorId);
  }

  async escalateOverdueWorkflows(now = new Date()) {
    return operations.escalateOverdueWorkflows(this.dependencies, now);
  }

  async listDelegations(query: { delegatorId?: string; workflowType?: WorkflowType }) {
    return operations.listWorkflowDelegations(this.dependencies, query);
  }

  async createDelegation(actorId: string, payload: CreateDelegationPayload) {
    return operations.createWorkflowDelegation(this.dependencies, actorId, payload);
  }

  async updateDelegation(actorId: string, id: string, payload: UpdateDelegationPayload) {
    return operations.updateWorkflowDelegation(this.dependencies, actorId, id, payload);
  }

  async deleteDelegation(actorId: string, id: string) {
    return operations.deleteWorkflowDelegation(this.dependencies, actorId, id);
  }
}
