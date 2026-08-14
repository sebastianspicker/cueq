/** Compatibility implementation for the injectable workflow-delegation CRUD provider. */
import type { WorkflowType } from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from './audit.helper.js';
import {
  createWorkflowDelegationInTransaction,
  deleteWorkflowDelegationInTransaction,
  type CreateDelegationPayload,
  type UpdateDelegationPayload,
  updateWorkflowDelegationInTransaction,
} from './workflow-delegation-mutation.helper.js';
import { validateInlineDelegation } from './workflow-delegation-validation.helper.js';

export type WorkflowDelegationCrudDependencies = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
};

export class WorkflowDelegationCrudFacade {
  constructor(private readonly dependencies: WorkflowDelegationCrudDependencies) {}

  async validateInlineDelegation(
    input: {
      delegateToId: string;
      actorId: string;
      actorRole: string;
      actorOrganizationUnitId: string;
      requesterId: string;
      workflowType: WorkflowType;
    },
    db: Pick<PrismaService, 'person'> = this.dependencies.prisma,
  ) {
    return validateInlineDelegation(input, db);
  }

  async listDelegations(query: { delegatorId?: string; workflowType?: WorkflowType }) {
    return this.dependencies.prisma.workflowDelegationRule.findMany({
      where: { delegatorId: query.delegatorId, workflowType: query.workflowType },
      orderBy: [{ delegatorId: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createDelegation(actorId: string, payload: CreateDelegationPayload) {
    return this.dependencies.prisma.$transaction((tx) =>
      createWorkflowDelegationInTransaction(tx, this.dependencies.auditHelper, actorId, payload),
    );
  }

  async updateDelegation(actorId: string, id: string, payload: UpdateDelegationPayload) {
    return this.dependencies.prisma.$transaction((tx) =>
      updateWorkflowDelegationInTransaction(
        tx,
        this.dependencies.auditHelper,
        actorId,
        id,
        payload,
      ),
    );
  }

  async deleteDelegation(actorId: string, id: string) {
    await this.dependencies.prisma.$transaction((tx) =>
      deleteWorkflowDelegationInTransaction(tx, this.dependencies.auditHelper, actorId, id),
    );
  }
}
