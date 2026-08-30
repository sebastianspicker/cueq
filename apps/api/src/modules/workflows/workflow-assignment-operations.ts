/** Composes workflow policy, routing, and escalation operations for the injectable provider. */
import type { Prisma, WorkflowPolicy } from '@cueq/database';
import type { Role, WorkflowType } from '@cueq/database';
import type { WorkflowPolicyUpsert } from '@cueq/contracts';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import {
  ensureWorkflowPolicy,
  getActiveWorkflowPolicy,
  listActiveWorkflowPolicies,
  listWorkflowPolicyHistory,
  upsertWorkflowPolicy,
} from './workflow-assignment-policy.js';
import {
  buildWorkflowAssignmentInTransaction,
  firstPersonByRoles,
} from './workflow-assignment-routing.js';
import { escalateOverdueWorkflows } from './workflow-assignment-escalation.js';
import type { WorkflowAssignmentInput, WorkflowAssignmentResult } from './workflow-contracts.js';

export type WorkflowAssignmentDependencies = {
  prisma: PrismaService;
  auditHelper: Pick<AuditHelper, 'appendAudit'>;
};

export function ensureAssignmentPolicy(
  { prisma }: WorkflowAssignmentDependencies,
  type: WorkflowType,
  tx?: Prisma.TransactionClient,
): Promise<WorkflowPolicy> {
  return ensureWorkflowPolicy(prisma, type, tx);
}

export function findFirstPersonByRoles(
  { prisma }: WorkflowAssignmentDependencies,
  roles: Role[],
  organizationUnitId?: string,
  excludeId?: string,
  db: Pick<PrismaService, 'person'> = prisma,
): Promise<string | null> {
  return firstPersonByRoles(roles, organizationUnitId, excludeId, db);
}

export async function createWorkflowAssignment(
  { prisma }: WorkflowAssignmentDependencies,
  input: WorkflowAssignmentInput,
  tx?: Prisma.TransactionClient,
): Promise<WorkflowAssignmentResult> {
  if (tx) return buildWorkflowAssignmentInTransaction(tx, input);

  return prisma.$transaction((transaction) =>
    buildWorkflowAssignmentInTransaction(transaction, input),
  );
}

export function findActiveWorkflowPolicy(
  { prisma }: WorkflowAssignmentDependencies,
  type: WorkflowType,
) {
  return getActiveWorkflowPolicy(prisma, type);
}

export function findActiveWorkflowPolicies({ prisma }: WorkflowAssignmentDependencies) {
  return listActiveWorkflowPolicies(prisma);
}

export function findWorkflowPolicyHistory(
  { prisma }: WorkflowAssignmentDependencies,
  type: WorkflowType,
) {
  return listWorkflowPolicyHistory(prisma, type);
}

export function saveWorkflowPolicy(
  { prisma, auditHelper }: WorkflowAssignmentDependencies,
  type: WorkflowType,
  payload: WorkflowPolicyUpsert,
  actorId?: string,
) {
  return upsertWorkflowPolicy(prisma, auditHelper, type, payload, actorId);
}

export function runOverdueWorkflowEscalation(
  { prisma, auditHelper }: WorkflowAssignmentDependencies,
  now = new Date(),
) {
  return escalateOverdueWorkflows(prisma, auditHelper, now);
}
