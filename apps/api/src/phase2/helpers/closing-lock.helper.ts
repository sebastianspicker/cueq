/** Enforces closing-period write barriers and records blocked attempts. */
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { ClosingStatus } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from './audit.helper.js';
import { lockClosingPeriodWrites } from './transaction-lock.helper.js';

/** Context recorded when a closing-period write barrier denies a mutation. */
export interface ClosingBlockedAttemptInput {
  actorId: string;
  organizationUnitId: string | null;
  from: Date;
  to: Date;
  attemptedAction: string;
  entityType: string;
  entityId: string;
}

function closingPeriodLockedConflictResponse(error: unknown): Record<string, unknown> | null {
  if (!(error instanceof ConflictException)) return null;
  const response = error.getResponse();
  if (
    typeof response !== 'object' ||
    response === null ||
    Reflect.get(response, 'code') !== 'CLOSING_PERIOD_LOCKED'
  ) {
    return null;
  }
  return response as Record<string, unknown>;
}

/**
 * Maps the Prisma schema `ClosingStatus` to the business-facing status.
 * The schema uses `CLOSED` but the business domain calls it `APPROVED`.
 * This mapping is intentional and permanent: the DB enum cannot be renamed
 * without a migration, so `CLOSED` === `APPROVED` by convention.
 */
export function toCoreClosingStatus(
  status: ClosingStatus,
): 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED' {
  if (status === ClosingStatus.CLOSED) {
    return 'APPROVED';
  }

  return status as 'OPEN' | 'REVIEW' | 'EXPORTED';
}

/**
 * Enforces the closing-period write barrier and records denied mutation attempts for audit review.
 * Transaction-aware checks must be used again after the caller acquires its write locks.
 */
@Injectable()
export class ClosingLockHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async findOverlappingLockedClosingPeriod(input: {
    organizationUnitId: string | null;
    from: Date;
    to: Date;
  }) {
    const where = this.overlappingClosingPeriodWhere(input, true);

    return this.prisma.closingPeriod.findFirst({
      where,
      orderBy: { periodStart: 'desc' },
    });
  }

  async assertClosingPeriodUnlockedForRangeInTransaction(
    input: {
      organizationUnitId: string | null;
      from: Date;
      to: Date;
    },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    // Lock every overlapping period, including OPEN periods.  A transition from
    // OPEN to REVIEW must therefore serialize with an overlapping write rather
    // than slipping in after an unlocked-state read.
    const overlappingPeriods = await tx.closingPeriod.findMany({
      where: this.overlappingClosingPeriodWhere(input, false),
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    for (const period of overlappingPeriods) {
      await lockClosingPeriodWrites(tx, period.id);
    }

    const lockedPeriod = await tx.closingPeriod.findFirst({
      where: this.overlappingClosingPeriodWhere(input, true),
      orderBy: { periodStart: 'desc' },
    });

    if (!lockedPeriod) {
      return;
    }

    throw new ConflictException({
      code: 'CLOSING_PERIOD_LOCKED',
      message: 'Requested mutation overlaps with a locked closing period.',
      closingPeriodId: lockedPeriod.id,
      status: toCoreClosingStatus(lockedPeriod.status),
      periodStart: lockedPeriod.periodStart.toISOString(),
      periodEnd: lockedPeriod.periodEnd.toISOString(),
      lockSource: lockedPeriod.lockSource ?? null,
    });
  }

  private overlappingClosingPeriodWhere(
    input: {
      organizationUnitId: string | null;
      from: Date;
      to: Date;
    },
    lockedOnly: boolean,
  ): Prisma.ClosingPeriodWhereInput {
    return {
      periodStart: { lte: input.to },
      periodEnd: { gte: input.from },
      ...(lockedOnly
        ? {
            status: {
              in: [ClosingStatus.REVIEW, ClosingStatus.CLOSED, ClosingStatus.EXPORTED],
            },
          }
        : {}),
      ...(input.organizationUnitId
        ? {
            OR: [
              { organizationUnitId: input.organizationUnitId },
              { organizationUnitId: null },
            ] as Prisma.ClosingPeriodWhereInput[],
          }
        : { organizationUnitId: null }),
    };
  }

  private async appendClosingLockBlockedAudit(
    input: ClosingBlockedAttemptInput,
    after: Prisma.JsonObject,
  ): Promise<void> {
    await this.auditHelper.appendAudit({
      actorId: input.actorId,
      action: 'CLOSING_LOCK_BLOCKED',
      entityType: input.entityType,
      entityId: input.entityId,
      before: {
        attemptedAction: input.attemptedAction,
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        organizationUnitId: input.organizationUnitId,
      },
      after,
    });
  }

  async assertClosingPeriodUnlockedForRange(input: ClosingBlockedAttemptInput) {
    const period = await this.findOverlappingLockedClosingPeriod({
      organizationUnitId: input.organizationUnitId,
      from: input.from,
      to: input.to,
    });

    if (!period) {
      return;
    }

    await this.appendClosingLockBlockedAudit(input, {
      closingPeriodId: period.id,
      status: toCoreClosingStatus(period.status),
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      lockedAt: period.lockedAt?.toISOString() ?? null,
      lockSource: period.lockSource ?? null,
    });

    throw new ConflictException({
      code: 'CLOSING_PERIOD_LOCKED',
      message: 'Requested mutation overlaps with a locked closing period.',
      closingPeriodId: period.id,
      status: toCoreClosingStatus(period.status),
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      lockSource: period.lockSource ?? null,
    });
  }

  async rethrowWithDurableClosingAudit(
    error: unknown,
    input: ClosingBlockedAttemptInput,
  ): Promise<never> {
    const conflict = closingPeriodLockedConflictResponse(error);
    if (conflict) {
      // The decisive guard runs inside the mutation transaction. If it catches
      // a period that locked after the preliminary check, that transaction
      // rolls back. Persist the denial from the captured conflict payload;
      // re-querying mutable closing state here could miss the audit if a reopen
      // commits between the rollback and this handler.
      await this.appendClosingLockBlockedAudit(input, {
        closingPeriodId:
          typeof conflict.closingPeriodId === 'string' ? conflict.closingPeriodId : null,
        status: typeof conflict.status === 'string' ? conflict.status : null,
        periodStart: typeof conflict.periodStart === 'string' ? conflict.periodStart : null,
        periodEnd: typeof conflict.periodEnd === 'string' ? conflict.periodEnd : null,
        lockSource:
          typeof conflict.lockSource === 'string' || conflict.lockSource === null
            ? conflict.lockSource
            : null,
      });
    }
    throw error;
  }
}
