/** Performs a transaction-local absence cancellation and related workflow/audit writes. */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AbsenceStatus, type Prisma, WorkflowStatus, WorkflowType } from '@cueq/database';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import type { AssignmentHelper, ResolvedEmployment } from '../people/public.js';

type AuditWriter = {
  appendAudit: (
    input: {
      actorId: string;
      action: string;
      entityType: string;
      entityId: string;
      before?: Prisma.JsonValue;
      after?: Prisma.JsonValue;
    },
    tx: Prisma.TransactionClient,
  ) => Promise<unknown>;
};

export async function writeAbsenceCancellation(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    absence: { id: string; personId: string; assignmentId: string; startDate: Date; endDate: Date };
    resolved: ResolvedEmployment;
    assignmentHelper: Pick<AssignmentHelper, 'assertUnchanged'>;
    assertClosingUnlocked: (tx: Prisma.TransactionClient) => Promise<void>;
    auditHelper: AuditWriter;
  },
) {
  const { actorId, absence, resolved, assignmentHelper, assertClosingUnlocked, auditHelper } =
    input;
  await assertClosingUnlocked(tx);
  await lockPersonWrites(tx, [absence.personId]);
  const currentEmployment = await assignmentHelper.assertUnchanged(
    tx,
    resolved,
    absence.startDate,
    new Date(absence.endDate.getTime() + 86_400_000),
  );

  const current = await tx.absence.findUnique({ where: { id: absence.id } });
  if (!current) {
    throw new NotFoundException('Absence not found.');
  }
  if (current.status !== AbsenceStatus.REQUESTED && current.status !== AbsenceStatus.APPROVED) {
    throw new BadRequestException('Only requested or approved absences can be cancelled.');
  }
  if (current.assignmentId !== currentEmployment.assignment.id) {
    throw new ConflictException({
      code: 'ABSENCE_ASSIGNMENT_CHANGED',
      message: 'Absence appointment changed; retry the cancellation.',
      retryable: true,
    });
  }

  const cancelled = await tx.absence.update({
    where: { id: current.id },
    data: { status: AbsenceStatus.CANCELLED },
  });
  await tx.workflowInstance.updateMany({
    where: {
      type: WorkflowType.LEAVE_REQUEST,
      entityType: 'Absence',
      entityId: current.id,
      assignmentId: current.assignmentId,
      status: {
        in: [WorkflowStatus.SUBMITTED, WorkflowStatus.PENDING, WorkflowStatus.ESCALATED],
      },
    },
    data: {
      status: WorkflowStatus.CANCELLED,
      approverId: actorId,
      decisionReason: 'absence cancelled by requester',
      decidedAt: new Date(),
    },
  });
  await auditHelper.appendAudit(
    {
      actorId,
      action: 'ABSENCE_CANCELLED',
      entityType: 'Absence',
      entityId: current.id,
      before: { status: current.status },
      after: { status: cancelled.status },
    },
    tx,
  );
  return cancelled;
}
