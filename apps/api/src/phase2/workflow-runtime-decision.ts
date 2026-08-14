import type { Prisma } from '@cueq/database';
import type { WorkflowDecisionCommand } from '@cueq/shared';
import type { PrismaService } from '../persistence/prisma.service.js';
import type { AuditHelper } from './helpers/audit.helper.js';
import type { WorkflowDelegationCrudHelper } from './helpers/workflow-delegation-crud.helper.js';
import type { WorkflowSideEffectsHelper } from './helpers/workflow-side-effects.helper.js';
import { lockPersonWrites } from './helpers/transaction-lock.helper.js';
import type { WorkflowActor, WorkflowDecisionResult } from './helpers/workflow-utils.js';
import { transitionWorkflowDecision } from './workflow-decision-transition.helper.js';

type WorkflowRuntimeDecisionDependencies = {
  prisma: PrismaService;
  auditHelper: AuditHelper;
  delegationCrud: WorkflowDelegationCrudHelper;
  sideEffectsHelper: WorkflowSideEffectsHelper;
};

/** Adapts the injectable runtime collaborators to the explicit decision transition contract. */
export function decideWorkflowTransition(
  dependencies: WorkflowRuntimeDecisionDependencies,
  actor: WorkflowActor,
  command: WorkflowDecisionCommand,
  tx?: Prisma.TransactionClient,
): Promise<WorkflowDecisionResult> {
  return transitionWorkflowDecision({ ...dependencies, lockPersonWrites }, { actor, command, tx });
}
