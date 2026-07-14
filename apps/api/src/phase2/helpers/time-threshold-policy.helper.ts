import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service';
import { AuditHelper } from './audit.helper';
import { lockPolicyWrites } from './transaction-lock.helper';

/** Resolved working-time thresholds from the active TimeThresholdPolicy. */
export interface TimeThresholds {
  /** Maximum permitted shift duration in minutes (ArbZG §3). */
  dailyMaxMinutes: number;
  /** Minimum rest period between shifts in minutes (ArbZG §5). */
  minRestMinutes: number;
}

const ARBZG_DEFAULTS: TimeThresholds = {
  dailyMaxMinutes: 600, // 10 h
  minRestMinutes: 660, // 11 h
};

@Injectable()
export class TimeThresholdPolicyHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  /**
   * Returns the currently active TimeThresholdPolicy thresholds.
   * Falls back to the ArbZG statutory defaults if no policy row exists.
   */
  async getActiveThresholds(): Promise<TimeThresholds> {
    const policy = await this.prisma.timeThresholdPolicy.findFirst({
      where: { activeTo: null },
      orderBy: { activeFrom: 'desc' },
    });

    if (!policy) {
      return ARBZG_DEFAULTS;
    }

    return {
      dailyMaxMinutes: policy.dailyMaxMinutes,
      minRestMinutes: policy.minRestMinutes,
    };
  }

  /**
   * Closes the current active policy and activates a new one.
   * Returns the newly created policy record.
   */
  async upsertThresholds(
    dailyMaxMinutes: number,
    minRestMinutes: number,
    actorId: string,
  ): Promise<TimeThresholds> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await lockPolicyWrites(tx, 'time-thresholds');

      const previous = await tx.timeThresholdPolicy.findMany({
        where: { activeTo: null },
        orderBy: { activeFrom: 'desc' },
      });
      await tx.timeThresholdPolicy.updateMany({
        where: { activeTo: null },
        data: { activeTo: now },
      });

      const created = await tx.timeThresholdPolicy.create({
        data: { dailyMaxMinutes, minRestMinutes, activeFrom: now },
      });

      await this.auditHelper.appendAudit(
        {
          actorId,
          action: 'TIME_THRESHOLD_POLICY_UPDATED',
          entityType: 'TimeThresholdPolicy',
          entityId: created.id,
          before: previous.map((entry) => ({
            id: entry.id,
            dailyMaxMinutes: entry.dailyMaxMinutes,
            minRestMinutes: entry.minRestMinutes,
            activeFrom: entry.activeFrom.toISOString(),
          })),
          after: {
            id: created.id,
            dailyMaxMinutes: created.dailyMaxMinutes,
            minRestMinutes: created.minRestMinutes,
            activeFrom: created.activeFrom.toISOString(),
          },
        },
        tx,
      );

      return {
        dailyMaxMinutes: created.dailyMaxMinutes,
        minRestMinutes: created.minRestMinutes,
      };
    });
  }
}
