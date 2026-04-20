import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service';

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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
  ): Promise<TimeThresholds> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.timeThresholdPolicy.updateMany({
        where: { activeTo: null },
        data: { activeTo: now },
      });

      const created = await tx.timeThresholdPolicy.create({
        data: { dailyMaxMinutes, minRestMinutes, activeFrom: now },
      });

      return {
        dailyMaxMinutes: created.dailyMaxMinutes,
        minRestMinutes: created.minRestMinutes,
      };
    });
  }
}
