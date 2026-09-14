import type { PrismaService } from '../../persistence/prisma.service.js';
import { BadRequestException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { ClosingBlockedAttemptInput } from '../../platform/transactions/closing-lock.helper.js';
import type { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import type { AssignmentHelper, PersonHelper } from '../people/public.js';
import type { WorkflowSideEffectsHelper } from './workflow-side-effects.helper.js';
import type { WorkflowDecisionService } from './workflow-decision.service.js';
import type { WorkflowRuntimeService } from './workflow-runtime.service.js';
import { WorkflowDecisionCommandSchema } from '@cueq/contracts';
import { prepareDecisionGuards } from './workflow-decision-guards.helper.js';

type WorkflowDecisionDependencies = {
  prisma: PrismaService;
  personHelper: PersonHelper;
  assignmentHelper: AssignmentHelper;
  workflowRuntimeService: WorkflowRuntimeService;
  workflowDecisionService: WorkflowDecisionService;
  sideEffectsHelper: WorkflowSideEffectsHelper;
  closingLockHelper: ClosingLockHelper;
};

/** Keeps decision guards, runtime transition, and side effects in the original transaction sequence. */
export async function decideWorkflowSubmission(
  dependencies: WorkflowDecisionDependencies,
  user: AuthenticatedIdentity,
  workflowId: string,
  payload: unknown,
  actorAssignmentId?: string,
): Promise<unknown> {
  const {
    prisma,
    personHelper,
    assignmentHelper,
    workflowRuntimeService,
    workflowDecisionService,
    sideEffectsHelper,
    closingLockHelper,
  } = dependencies;
  const actor = await personHelper.personForUser(user);
  const actorAssignment = await assignmentHelper.resolveInterval(
    actor.id,
    new Date(),
    undefined,
    actorAssignmentId,
  );
  const parsed = WorkflowDecisionCommandSchema.parse({
    ...(payload as Record<string, unknown>),
    workflowId,
  });
  const requestedAssignmentId =
    payload &&
    typeof payload === 'object' &&
    typeof (payload as Record<string, unknown>).assignmentId === 'string'
      ? ((payload as Record<string, unknown>).assignmentId as string)
      : undefined;
  const requestedAction = workflowRuntimeService.normalizeAction(parsed);
  let blockedAttempt: ClosingBlockedAttemptInput | null = null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const scopedWorkflow = await tx.workflowInstance.findUnique({
        where: { id: workflowId },
        select: { assignmentId: true },
      });
      if (
        scopedWorkflow &&
        requestedAssignmentId !== undefined &&
        requestedAssignmentId !== scopedWorkflow.assignmentId
      ) {
        throw new BadRequestException('Workflow appointment does not match the request.');
      }
      blockedAttempt = await prepareDecisionGuards({
        tx,
        workflowId,
        requestedAction,
        actorId: actor.id,
        assignmentHelper,
        closingLockHelper,
        recordBlockedAttempt: (attempt) => {
          blockedAttempt = attempt;
        },
      });
      if (requestedAction === 'APPROVE') {
        await sideEffectsHelper.validatePreApproval(workflowId, tx);
      }
      const decision = await workflowDecisionService.decide(
        { id: actor.id, role: user.role, organizationUnitId: actorAssignment.organizationUnitId },
        parsed,
        tx,
      );
      await sideEffectsHelper.applyDecisionSideEffects(actor.id, decision, tx, parsed.reason);
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
