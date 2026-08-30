/** Injectable provider for workflow policy, routing, and overdue-escalation operations. */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, Role, WorkflowPolicy, WorkflowType } from '@cueq/database';
import type { WorkflowPolicyUpsert } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from '../audit/public.js';
import * as operations from './workflow-assignment-operations.js';
import type { WorkflowAssignmentInput, WorkflowAssignmentResult } from './workflow-contracts.js';
export { WORKFLOW_ROUTING_LOCK_SCOPE } from './workflow-assignment-policy.js';

@Injectable()
export class WorkflowAssignmentHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  // prettier-ignore
  async ensurePolicy(type: WorkflowType, tx?: Prisma.TransactionClient): Promise<WorkflowPolicy> { return operations.ensureAssignmentPolicy(this.dependencies(), type, tx); }
  // prettier-ignore
  async firstPersonByRoles(roles: Role[], organizationUnitId?: string, excludeId?: string, db: Pick<PrismaService, 'person'> = this.prisma): Promise<string | null> { return operations.findFirstPersonByRoles(this.dependencies(), roles, organizationUnitId, excludeId, db); }
  // prettier-ignore
  async buildWorkflowAssignment(input: WorkflowAssignmentInput, tx?: Prisma.TransactionClient): Promise<WorkflowAssignmentResult> { return operations.createWorkflowAssignment(this.dependencies(), input, tx); }
  // prettier-ignore
  async getPolicy(type: WorkflowType) { return operations.findActiveWorkflowPolicy(this.dependencies(), type); }
  // prettier-ignore
  async listPolicies() { return operations.findActiveWorkflowPolicies(this.dependencies()); }
  // prettier-ignore
  async listPolicyHistory(type: WorkflowType) { return operations.findWorkflowPolicyHistory(this.dependencies(), type); }
  // prettier-ignore
  async upsertPolicy(type: WorkflowType, payload: WorkflowPolicyUpsert, actorId?: string) { return operations.saveWorkflowPolicy(this.dependencies(), type, payload, actorId); }
  // prettier-ignore
  async escalateOverdueWorkflows(now = new Date()) { return operations.runOverdueWorkflowEscalation(this.dependencies(), now); }

  // prettier-ignore
  private dependencies(): operations.WorkflowAssignmentDependencies { return { prisma: this.prisma, auditHelper: this.auditHelper }; }
}
