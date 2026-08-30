/** Injectable provider for workflow-delegation CRUD operations. */
import type { WorkflowType } from '@cueq/database';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from '../audit/public.js';
import {
  createWorkflowDelegationInTransaction,
  deleteWorkflowDelegationInTransaction,
  type CreateDelegationPayload,
  type UpdateDelegationPayload,
  updateWorkflowDelegationInTransaction,
} from './workflow-delegation-mutation.helper.js';
import { validateInlineDelegation } from './workflow-delegation-validation.helper.js';

@Injectable()
export class WorkflowDelegationCrudHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async validateInlineDelegation(
    input: {
      delegateToId: string;
      actorId: string;
      actorRole: string;
      actorOrganizationUnitId: string;
      requesterId: string;
      workflowType: WorkflowType;
    },
    db: Pick<PrismaService, 'person'> = this.prisma,
  ) {
    return validateInlineDelegation(input, db);
  }

  async listDelegations(query: { delegatorId?: string; workflowType?: WorkflowType }) {
    return this.prisma.workflowDelegationRule.findMany({
      where: { delegatorId: query.delegatorId, workflowType: query.workflowType },
      orderBy: [{ delegatorId: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createDelegation(actorId: string, payload: CreateDelegationPayload) {
    return this.prisma.$transaction((tx) =>
      createWorkflowDelegationInTransaction(tx, this.auditHelper, actorId, payload),
    );
  }

  async updateDelegation(actorId: string, id: string, payload: UpdateDelegationPayload) {
    return this.prisma.$transaction((tx) =>
      updateWorkflowDelegationInTransaction(tx, this.auditHelper, actorId, id, payload),
    );
  }

  async deleteDelegation(actorId: string, id: string) {
    await this.prisma.$transaction((tx) =>
      deleteWorkflowDelegationInTransaction(tx, this.auditHelper, actorId, id),
    );
  }
}
