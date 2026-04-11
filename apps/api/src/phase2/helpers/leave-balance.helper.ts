import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AbsenceStatus, AbsenceType } from '@cueq/database';
import { calculateLeaveLedger } from '@cueq/core';
import { DEFAULT_LEAVE_RULE } from '@cueq/policy';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from './person.helper';

@Injectable()
export class LeaveBalanceHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
  ) {}

  private defaultAsOfDate(targetYear: number): string {
    const today = new Date();
    const currentYear = today.getUTCFullYear();
    if (targetYear === currentYear) {
      return today.toISOString().slice(0, 10);
    }
    return `${targetYear}-12-31`;
  }

  private computeLeaveEntitlementCarryOver(input: {
    year: number;
    workTimeModelWeeklyHours: number;
    employmentStartDate?: string;
    employmentEndDate?: string;
    usage: Array<{ date: string; days: number }>;
    adjustments: Array<{ year: number; deltaDays: number }>;
    priorYearCarryOverDays?: number;
    asOfDate: string;
  }) {
    return calculateLeaveLedger({
      year: input.year,
      asOfDate: input.asOfDate,
      workTimeModelWeeklyHours: input.workTimeModelWeeklyHours,
      employmentStartDate: input.employmentStartDate,
      employmentEndDate: input.employmentEndDate,
      priorYearCarryOverDays: input.priorYearCarryOverDays ?? 0,
      annualLeaveUsage: input.usage,
      adjustments: input.adjustments,
    });
  }

  async leaveBalance(user: AuthenticatedIdentity, year?: number, asOfDate?: string) {
    const person = await this.personHelper.personForUser(user);
    const workTimeModel = person.workTimeModelId
      ? await this.prisma.workTimeModel.findUnique({ where: { id: person.workTimeModelId } })
      : null;
    const targetYear = year ?? new Date().getUTCFullYear();
    const resolvedAsOfDate = asOfDate ?? this.defaultAsOfDate(targetYear);
    const asOf = new Date(`${resolvedAsOfDate}T00:00:00.000Z`);
    if (Number.isNaN(asOf.getTime())) {
      throw new BadRequestException('Invalid asOfDate.');
    }
    if (asOf.getUTCFullYear() !== targetYear) {
      throw new BadRequestException('asOfDate must be within the requested year.');
    }

    const from = new Date(Date.UTC(targetYear, 0, 1));
    const to = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));
    const previousYear = targetYear - 1;
    const previousFrom = new Date(Date.UTC(previousYear, 0, 1));
    const previousTo = new Date(Date.UTC(previousYear, 11, 31, 23, 59, 59, 999));

    const [annualLeaveAbsences, priorAnnualLeaveAbsences, adjustments] = await Promise.all([
      this.prisma.absence.findMany({
        where: {
          personId: person.id,
          status: AbsenceStatus.APPROVED,
          type: AbsenceType.ANNUAL_LEAVE,
          startDate: { lte: to },
          endDate: { gte: from },
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.absence.findMany({
        where: {
          personId: person.id,
          status: AbsenceStatus.APPROVED,
          type: AbsenceType.ANNUAL_LEAVE,
          startDate: { lte: previousTo },
          endDate: { gte: previousFrom },
        },
        orderBy: { startDate: 'asc' },
      }),
      this.prisma.leaveAdjustment.findMany({
        where: {
          personId: person.id,
          year: { in: [previousYear, targetYear] },
        },
      }),
    ]);

    const modelWeeklyHours = Number(
      workTimeModel?.weeklyHours ?? DEFAULT_LEAVE_RULE.fullTimeWeeklyHours,
    );
    const employmentStartDate = person.employmentStartDate?.toISOString().slice(0, 10);
    const employmentEndDate = person.employmentEndDate?.toISOString().slice(0, 10);
    const priorYearLedger = this.computeLeaveEntitlementCarryOver({
      year: previousYear,
      asOfDate: `${previousYear}-12-31`,
      workTimeModelWeeklyHours: modelWeeklyHours,
      employmentStartDate,
      employmentEndDate,
      usage: priorAnnualLeaveAbsences.map((absence) => ({
        date: absence.startDate.toISOString().slice(0, 10),
        days: Number(absence.days),
      })),
      adjustments: adjustments.map((entry) => ({
        year: entry.year,
        deltaDays: Number(entry.deltaDays),
      })),
      priorYearCarryOverDays: 0,
    });
    const priorYearCarryOverDays = Math.max(priorYearLedger.remainingDays, 0);

    const calculation = this.computeLeaveEntitlementCarryOver({
      year: targetYear,
      asOfDate: resolvedAsOfDate,
      workTimeModelWeeklyHours: modelWeeklyHours,
      employmentStartDate,
      employmentEndDate,
      usage: annualLeaveAbsences.map((absence) => ({
        date: absence.startDate.toISOString().slice(0, 10),
        days: Number(absence.days),
      })),
      adjustments: adjustments.map((entry) => ({
        year: entry.year,
        deltaDays: Number(entry.deltaDays),
      })),
      priorYearCarryOverDays,
    });

    return {
      personId: person.id,
      year: targetYear,
      asOfDate: resolvedAsOfDate,
      entitlement: calculation.entitlementDays,
      used: calculation.usedDays,
      remaining: calculation.remainingDays,
      carriedOver: calculation.carriedOverDays,
      carriedOverUsed: calculation.carriedOverUsedDays,
      forfeited: calculation.forfeitedDays,
      adjustments: calculation.adjustmentsDays,
    };
  }
}
