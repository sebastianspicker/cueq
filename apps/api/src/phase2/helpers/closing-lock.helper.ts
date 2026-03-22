import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { ClosingStatus } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service';
import { AuditHelper } from './audit.helper';

export function toCoreClosingStatus(
  status: ClosingStatus,
): 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED' {
  if (status === ClosingStatus.CLOSED) {
    return 'APPROVED';
  }

  return status as 'OPEN' | 'REVIEW' | 'EXPORTED';
}

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
    const where: Prisma.ClosingPeriodWhereInput = {
      periodStart: { lte: input.to },
      periodEnd: { gte: input.from },
      status: {
        in: [ClosingStatus.REVIEW, ClosingStatus.CLOSED, ClosingStatus.EXPORTED],
      },
      ...(input.organizationUnitId
        ? {
            OR: [
              { organizationUnitId: input.organizationUnitId },
              { organizationUnitId: null },
            ] as Prisma.ClosingPeriodWhereInput[],
          }
        : { organizationUnitId: null }),
    };

    return this.prisma.closingPeriod.findFirst({
      where,
      orderBy: { periodStart: 'desc' },
    });
  }

  async assertClosingPeriodUnlockedForRange(input: {
    actorId: string;
    organizationUnitId: string | null;
    from: Date;
    to: Date;
    attemptedAction: string;
    entityType: string;
    entityId: string;
  }) {
    const period = await this.findOverlappingLockedClosingPeriod({
      organizationUnitId: input.organizationUnitId,
      from: input.from,
      to: input.to,
    });

    if (!period) {
      return;
    }

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
      after: {
        closingPeriodId: period.id,
        status: toCoreClosingStatus(period.status),
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
        lockedAt: period.lockedAt?.toISOString() ?? null,
        lockSource: period.lockSource ?? null,
      },
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
}
