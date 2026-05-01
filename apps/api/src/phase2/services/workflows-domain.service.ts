import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service';
import type { WorkflowType } from '@cueq/database';
import {
  WorkflowDecisionCommandSchema,
  WorkflowInboxQuerySchema,
  WorkflowPolicyUpsertSchema,
  WorkflowTypeSchema,
  CreateWorkflowDelegationRuleSchema,
  UpdateWorkflowDelegationRuleSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';
import { WorkflowRuntimeService } from '../workflow-runtime.service';
import { assertHrLikeRole } from '../helpers/role-constants';
import { WorkflowCreationHelper } from '../helpers/workflow-creation.helper';
import { WorkflowSideEffectsHelper } from '../helpers/workflow-side-effects.helper';

@Injectable()
export class WorkflowsDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
    @Inject(WorkflowCreationHelper) private readonly creationHelper: WorkflowCreationHelper,
    @Inject(WorkflowSideEffectsHelper)
    private readonly sideEffectsHelper: WorkflowSideEffectsHelper,
  ) {}

  /* ── Workflow Creation (delegated) ─────────────────────────── */

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

  /* ── Inbox & Detail ──────────────────────────────────────────── */

  async workflowInbox(user: AuthenticatedIdentity, query?: unknown): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);
    const parsed = WorkflowInboxQuerySchema.parse(query ?? {});

    return this.workflowRuntimeService.listInbox(
      {
        id: person.id,
        role: user.role,
        organizationUnitId: person.organizationUnitId,
      },
      parsed,
    );
  }

  async workflowDetail(user: AuthenticatedIdentity, workflowId: string): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);
    return this.workflowRuntimeService.getDetail(
      {
        id: person.id,
        role: user.role,
        organizationUnitId: person.organizationUnitId,
      },
      workflowId,
    );
  }

  /* ── Workflow Policies ───────────────────────────────────────── */

  async listWorkflowPolicies(user: AuthenticatedIdentity): Promise<unknown> {
    assertHrLikeRole(user);
    return this.workflowRuntimeService.listPolicies();
  }

  async getWorkflowPolicy(user: AuthenticatedIdentity, type: string): Promise<unknown> {
    assertHrLikeRole(user);
    const parsedType = WorkflowTypeSchema.parse(type) as WorkflowType;
    return this.workflowRuntimeService.getPolicy(parsedType);
  }

  async listWorkflowPolicyHistory(user: AuthenticatedIdentity, type: string): Promise<unknown> {
    assertHrLikeRole(user);
    const parsedType = WorkflowTypeSchema.parse(type) as WorkflowType;
    return this.workflowRuntimeService.listPolicyHistory(parsedType);
  }

  async upsertWorkflowPolicy(
    user: AuthenticatedIdentity,
    type: string,
    payload: unknown,
  ): Promise<unknown> {
    assertHrLikeRole(user);
    const parsedType = WorkflowTypeSchema.parse(type);
    const parsedPayload = WorkflowPolicyUpsertSchema.parse(payload);
    return this.workflowRuntimeService.upsertPolicy(parsedType as WorkflowType, parsedPayload);
  }

  /* ── Workflow Delegations ────────────────────────────────────── */

  async listWorkflowDelegations(
    user: AuthenticatedIdentity,
    query: { delegatorId?: string; workflowType?: string },
  ): Promise<unknown> {
    assertHrLikeRole(user);
    const workflowType = query.workflowType
      ? (WorkflowTypeSchema.parse(query.workflowType) as WorkflowType)
      : undefined;
    return this.workflowRuntimeService.listDelegations({
      delegatorId: query.delegatorId,
      workflowType,
    });
  }

  async createWorkflowDelegation(user: AuthenticatedIdentity, payload: unknown): Promise<unknown> {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateWorkflowDelegationRuleSchema.parse(payload);
    return this.workflowRuntimeService.createDelegation(actor.id, {
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

  async updateWorkflowDelegation(
    user: AuthenticatedIdentity,
    id: string,
    payload: unknown,
  ): Promise<unknown> {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    const parsed = UpdateWorkflowDelegationRuleSchema.parse(payload);
    return this.workflowRuntimeService.updateDelegation(actor.id, id, {
      delegateId: parsed.delegateId,
      workflowType: parsed.workflowType as WorkflowType | null | undefined,
      organizationUnitId: parsed.organizationUnitId,
      activeFrom: parsed.activeFrom,
      activeTo: parsed.activeTo,
      isActive: parsed.isActive,
      priority: parsed.priority,
    });
  }

  async deleteWorkflowDelegation(user: AuthenticatedIdentity, id: string): Promise<unknown> {
    assertHrLikeRole(user);
    const actor = await this.personHelper.personForUser(user);
    await this.workflowRuntimeService.deleteDelegation(actor.id, id);
    return { deleted: true, id };
  }

  /* ── Workflow Decision (orchestration) ───────────────────────── */

  async decideWorkflow(
    user: AuthenticatedIdentity,
    workflowId: string,
    payload: unknown,
  ): Promise<unknown> {
    const actor = await this.personHelper.personForUser(user);
    const parsed = WorkflowDecisionCommandSchema.parse({
      ...(payload as Record<string, unknown>),
      workflowId,
    });
    const requestedAction = this.workflowRuntimeService.normalizeAction(parsed);

    const result = await this.prisma.$transaction(async (tx) => {
      if (requestedAction === 'APPROVE') {
        await this.sideEffectsHelper.validatePreApproval(workflowId, tx);
      }

      const decision = await this.workflowRuntimeService.decide(
        {
          id: actor.id,
          role: user.role,
          organizationUnitId: actor.organizationUnitId,
        },
        parsed,
        tx,
      );

      await this.sideEffectsHelper.applyDecisionSideEffects(actor.id, decision, parsed.reason, tx);

      return decision.updated;
    });

    return result;
  }
}
