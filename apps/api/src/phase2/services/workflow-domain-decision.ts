import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { ClosingBlockedAttemptInput } from '../helpers/closing-lock.helper.js';
import type { ClosingLockHelper } from '../helpers/closing-lock.helper.js';
import type { PersonHelper } from '../helpers/person.helper.js';
import type { WorkflowSideEffectsHelper } from '../helpers/workflow-side-effects.helper.js';
import type { WorkflowRuntimeService } from '../workflow-runtime.service.js';
import { WorkflowDecisionCommandSchema } from '@cueq/shared';
import { prepareDecisionGuards } from './workflow-decision-guards.helper.js';

type WorkflowDecisionDependencies = {
  prisma: PrismaService;
  personHelper: PersonHelper;
  workflowRuntimeService: WorkflowRuntimeService;
  sideEffectsHelper: WorkflowSideEffectsHelper;
  closingLockHelper: ClosingLockHelper;
};

/** Keeps decision guards, runtime transition, and side effects in the original transaction sequence. */
export async function decideWorkflowSubmission(
  dependencies: WorkflowDecisionDependencies,
  user: AuthenticatedIdentity,
  workflowId: string,
  payload: unknown,
): Promise<unknown> {
  const { prisma, personHelper, workflowRuntimeService, sideEffectsHelper, closingLockHelper } =
    dependencies;
  const actor = await personHelper.personForUser(user);
  const parsed = WorkflowDecisionCommandSchema.parse({
    ...(payload as Record<string, unknown>),
    workflowId,
  });
  const requestedAction = workflowRuntimeService.normalizeAction(parsed);
  let blockedAttempt: ClosingBlockedAttemptInput | null = null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      blockedAttempt = await prepareDecisionGuards({
        tx,
        workflowId,
        requestedAction,
        actorId: actor.id,
        closingLockHelper,
        recordBlockedAttempt: (attempt) => {
          blockedAttempt = attempt;
        },
      });
      if (requestedAction === 'APPROVE') {
        await sideEffectsHelper.validatePreApproval(workflowId, tx);
      }
      const decision = await workflowRuntimeService.decide(
        { id: actor.id, role: user.role, organizationUnitId: actor.organizationUnitId },
        parsed,
        tx,
      );
      await sideEffectsHelper.applyDecisionSideEffects(actor.id, decision, parsed.reason, tx);
      return decision.updated;
    });
    return result;
  } catch (error) {
    if (blockedAttempt) {
      return closingLockHelper.rethrowWithDurableClosingAudit(error, blockedAttempt);
    }
    throw error;
  }
}
