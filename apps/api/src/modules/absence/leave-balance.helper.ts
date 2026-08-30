/** Calculates leave entitlement and carry-over from employment terms, absences, and adjustments. */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { type Absence, AbsenceStatus, AbsenceType } from '@cueq/database';
import { calculateAbsenceWorkingDays, calculateLeaveLedger, parseDateOnly } from '@cueq/domain';
import { DEFAULT_LEAVE_RULE } from '@cueq/policy';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { HolidayProvider } from './holiday.provider.js';
import { PersonHelper } from '../people/public.js';

/**
 * Calculates leave balances from employment terms, approved absences, and adjustments.
 * Callers use the same calculation for employee views and closing validations.
 */
@Injectable()
export class LeaveBalanceHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(HolidayProvider) private readonly holidayProvider: HolidayProvider,
  ) {}

  private leaveUsageForPeriod(absences: Absence[], from: Date, to: Date) {
    return absences.flatMap((absence) => {
      const start = absence.startDate > from ? absence.startDate : from;
      const end = absence.endDate < to ? absence.endDate : to;
      if (start > end) return [];

      const startDate = start.toISOString().slice(0, 10);
      const endDate = end.toISOString().slice(0, 10);
      return [
        {
          date: startDate,
          days: calculateAbsenceWorkingDays({
            startDate,
            endDate,
            holidayDates: this.holidayProvider.holidayDatesBetween(startDate, endDate),
          }),
        },
      ];
    });
  }

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
    const targetYear = year ?? new Date().getUTCFullYear();
    const resolvedAsOfDate = asOfDate ?? this.defaultAsOfDate(targetYear);
    let asOf: Date;
    try {
      asOf = parseDateOnly(resolvedAsOfDate);
    } catch {
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
    const workTimeModel = person.workTimeModelId
      ? this.prisma.workTimeModel.findUnique({ where: { id: person.workTimeModelId } })
      : Promise.resolve(null);

    const [resolvedWorkTimeModel, annualLeaveAbsences, priorAnnualLeaveAbsences, adjustments] =
      await Promise.all([
        workTimeModel,
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
      resolvedWorkTimeModel?.weeklyHours ?? DEFAULT_LEAVE_RULE.fullTimeWeeklyHours,
    );
    const employmentStartDate = person.employmentStartDate?.toISOString().slice(0, 10);
    const employmentEndDate = person.employmentEndDate?.toISOString().slice(0, 10);
    const priorYearLedger = this.computeLeaveEntitlementCarryOver({
      year: previousYear,
      asOfDate: `${previousYear}-12-31`,
      workTimeModelWeeklyHours: modelWeeklyHours,
      employmentStartDate,
      employmentEndDate,
      usage: this.leaveUsageForPeriod(priorAnnualLeaveAbsences, previousFrom, previousTo),
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
      usage: this.leaveUsageForPeriod(annualLeaveAbsences, from, asOf),
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
