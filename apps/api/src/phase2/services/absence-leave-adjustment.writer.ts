/** Performs one transaction-local leave adjustment with locking, identity recheck, and audit. */
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import type { CreateLeaveAdjustment } from '@cueq/shared';
import { lockPersonWrites } from '../helpers/transaction-lock.helper.js';

type AuditWriter = {
  appendAudit: (
    input: {
      actorId: string;
      action: string;
      entityType: string;
      entityId: string;
      after?: Prisma.JsonValue;
      reason?: string;
    },
    tx: Prisma.TransactionClient,
  ) => Promise<unknown>;
};

export async function writeLeaveAdjustment(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    parsed: CreateLeaveAdjustment;
    organizationUnitId: string;
    assertClosingUnlocked: (tx: Prisma.TransactionClient) => Promise<void>;
    auditHelper: AuditWriter;
  },
) {
  const { actorId, parsed, organizationUnitId, assertClosingUnlocked, auditHelper } = input;
  await assertClosingUnlocked(tx);
  await lockPersonWrites(tx, [parsed.personId]);
  const currentPerson = await tx.person.findUnique({
    where: { id: parsed.personId },
    select: { organizationUnitId: true },
  });
  if (!currentPerson) {
    throw new NotFoundException('Person not found.');
  }
  if (currentPerson.organizationUnitId !== organizationUnitId) {
    throw new ConflictException({
      code: 'PERSON_IDENTITY_CHANGED',
      message: 'Person organization assignment changed; retry the leave adjustment.',
      retryable: true,
    });
  }

  const adjustment = await tx.leaveAdjustment.create({
    data: {
      personId: parsed.personId,
      year: parsed.year,
      deltaDays: parsed.deltaDays,
      reason: parsed.reason,
      createdBy: actorId,
    },
  });
  await auditHelper.appendAudit(
    {
      actorId,
      action: 'LEAVE_ADJUSTMENT_CREATED',
      entityType: 'LeaveAdjustment',
      entityId: adjustment.id,
      after: {
        personId: adjustment.personId,
        year: adjustment.year,
        deltaDays: Number(adjustment.deltaDays),
      },
      reason: adjustment.reason,
    },
    tx,
  );
  return adjustment;
}
