/** Resolves and versions the working-time threshold policy. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from '../audit/public.js';
import { lockPolicyWrites } from '../../platform/transactions/transaction-lock.helper.js';

/** Resolved working-time thresholds from the active TimeThresholdPolicy. */
export interface TimeThresholds {
  /** Configured daily-duration threshold used by closing checks. */
  dailyMaxMinutes: number;
  /** Configured minimum rest threshold used by closing checks. */
  minRestMinutes: number;
}

const ARBZG_DEFAULTS: TimeThresholds = {
  dailyMaxMinutes: 600, // Repository fallback: extended 10-hour daily threshold.
  minRestMinutes: 660, // Repository fallback: 11-hour minimum rest.
};

/**
 * Resolves and versions configurable working-time thresholds under a policy lock, with audit-backed changes.
 */
@Injectable()
export class TimeThresholdPolicyHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  /**
   * Returns the currently active TimeThresholdPolicy thresholds.
   * Falls back to the repository's 10-hour/11-hour baseline if no policy row exists.
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
