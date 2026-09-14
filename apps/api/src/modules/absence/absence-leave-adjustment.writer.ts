/** Performs one transaction-local leave adjustment with locking, identity recheck, and audit. */
import type { Prisma } from '@cueq/database';
import type { CreateLeaveAdjustment } from '@cueq/contracts';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import type { AssignmentHelper, ResolvedEmployment } from '../people/public.js';

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
    resolved: ResolvedEmployment;
    interval: { from: Date; to: Date };
    assignmentHelper: Pick<AssignmentHelper, 'assertUnchanged'>;
    assertClosingUnlocked: (tx: Prisma.TransactionClient) => Promise<void>;
    auditHelper: AuditWriter;
  },
) {
  const {
    actorId,
    parsed,
    resolved,
    interval,
    assignmentHelper,
    assertClosingUnlocked,
    auditHelper,
  } = input;
  await assertClosingUnlocked(tx);
  await lockPersonWrites(tx, [parsed.personId]);
  const current = await assignmentHelper.assertUnchanged(tx, resolved, interval.from, interval.to);

  const adjustment = await tx.leaveAdjustment.create({
    data: {
      personId: parsed.personId,
      assignmentId: current.assignment.id,
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
        assignmentId: adjustment.assignmentId,
        year: adjustment.year,
        deltaDays: Number(adjustment.deltaDays),
      },
      reason: adjustment.reason,
    },
    tx,
  );
  return adjustment;
}
