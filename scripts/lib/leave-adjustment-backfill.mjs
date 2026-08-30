/** Implements the transaction, advisory lock, mutation, and audit for one person-year backfill. */
const ZERO_DELTA_MARKER = 'LEAVE_ADJUSTMENT_BACKFILL_ZERO_DELTA';

/** Create at most one zero-delta adjustment and matching audit entry for a person-year. */
export async function backfillPersonYear(db, input) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`cueq:leave-adjustment:${input.personId}:${input.year}`}))
    `;
    const existing = await tx.leaveAdjustment.findFirst({
      where: { personId: input.personId, year: input.year },
      select: { id: true },
    });
    if (existing) return { created: false, id: existing.id };
    const adjustment = await tx.leaveAdjustment.create({
      data: {
        personId: input.personId,
        year: input.year,
        deltaDays: 0,
        reason: input.reason,
        createdBy: input.createdBy,
      },
    });
    await tx.auditEntry.create({
      data: {
        actorId: input.createdBy,
        action: ZERO_DELTA_MARKER,
        entityType: 'LeaveAdjustment',
        entityId: adjustment.id,
        before: null,
        after: {
          personId: input.personId,
          year: input.year,
          deltaDays: 0,
          reason: input.reason,
          createdBy: input.createdBy,
        },
        reason: input.reason,
      },
    });
    return { created: true, id: adjustment.id };
  });
}
