/** Performs a transaction-local absence cancellation and related workflow/audit writes. */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AbsenceStatus, type Prisma, WorkflowStatus, WorkflowType } from '@cueq/database';
import { lockPersonWrites } from '../helpers/transaction-lock.helper.js';

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
    absence: { id: string; personId: string; startDate: Date; endDate: Date };
    organizationUnitId: string;
    assertClosingUnlocked: (tx: Prisma.TransactionClient) => Promise<void>;
    auditHelper: AuditWriter;
  },
) {
  const { actorId, absence, organizationUnitId, assertClosingUnlocked, auditHelper } = input;
  await assertClosingUnlocked(tx);
  await lockPersonWrites(tx, [absence.personId]);
  const currentTargetPerson = await tx.person.findUnique({
    where: { id: absence.personId },
    select: { organizationUnitId: true },
  });
  if (!currentTargetPerson) {
    throw new NotFoundException('Person not found.');
  }
  if (currentTargetPerson.organizationUnitId !== organizationUnitId) {
    throw new ConflictException({
      code: 'PERSON_IDENTITY_CHANGED',
      message: 'Person organization assignment changed; retry the absence cancellation.',
      retryable: true,
    });
  }

  const current = await tx.absence.findUnique({ where: { id: absence.id } });
  if (!current) {
    throw new NotFoundException('Absence not found.');
  }
  if (current.status !== AbsenceStatus.REQUESTED && current.status !== AbsenceStatus.APPROVED) {
    throw new BadRequestException('Only requested or approved absences can be cancelled.');
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
