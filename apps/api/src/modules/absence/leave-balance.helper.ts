/** Calculates appointment-scoped leave entitlement, usage, and carry-over. */
import { isDeepStrictEqual } from 'node:util';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { AbsenceStatus, AbsenceType, type Prisma } from '@cueq/database';
import {
  AssignmentLeaveLedgerError,
  calculateAssignmentLeaveLedger,
  countAssignmentWorkingDays,
  parseDateOnly,
  type AssignmentLeaveCalculationPolicy,
  type AssignmentLeaveSegment,
} from '@cueq/domain';
import { LeaveRuleSchema, type LeaveRule } from '@cueq/policy';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { AssignmentHelper, PersonHelper } from '../people/public.js';

type Term = Prisma.EmploymentTermGetPayload<{
  include: { employmentGroup: true; holidayCalendar: true; workTimeModel: true };
}>;
type YearBounds = { from: string; to: string };

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function yearBounds(year: number): YearBounds {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function maxDate(...values: string[]): string {
  return values.reduce((maximum, value) => (value > maximum ? value : maximum));
}

function minDate(...values: string[]): string {
  return values.reduce((minimum, value) => (value < minimum ? value : minimum));
}

function assignmentBounds(
  assignment: { employmentStartDate: Date | null; employmentEndDate: Date | null },
  year: number,
): YearBounds | null {
  const yearRange = yearBounds(year);
  const from = assignment.employmentStartDate
    ? maxDate(yearRange.from, dateOnly(assignment.employmentStartDate))
    : yearRange.from;
  const to = assignment.employmentEndDate
    ? minDate(yearRange.to, dateOnly(assignment.employmentEndDate))
    : yearRange.to;
  return from <= to ? { from, to } : null;
}

function termDateBounds(term: Term): YearBounds {
  return {
    from: term.effectiveFrom ? dateOnly(term.effectiveFrom) : '0000-01-01',
    to: term.effectiveTo ? dateOnly(new Date(term.effectiveTo.getTime() - 1)) : '9999-12-31',
  };
}

function leaveRule(term: Term): LeaveRule {
  const parsed = LeaveRuleSchema.safeParse(term.employmentGroup.leavePolicy);
  if (!parsed.success) {
    throw new ConflictException({
      code: 'LEAVE_POLICY_INVALID',
      message: 'Appointment leave policy is missing or invalid.',
    });
  }
  return parsed.data;
}

function isCalculationPolicy(value: unknown): value is AssignmentLeaveCalculationPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  return (
    policy.proration === 'CALENDAR_DAYS' &&
    (policy.partTimeBasis === 'WEEKLY_HOURS' || policy.partTimeBasis === 'WORKING_DAYS') &&
    policy.rounding === 'TWO_DECIMALS_AT_TOTAL' &&
    (policy.carryOverPolicyAt === 'YEAR_START' ||
      policy.carryOverPolicyAt === 'YEAR_END' ||
      policy.carryOverPolicyAt === 'AS_OF')
  );
}

function termChangePolicy(terms: Term[]): AssignmentLeaveCalculationPolicy | undefined {
  const configured = terms.flatMap((term) => {
    const raw = term.employmentGroup.leavePolicy;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const candidate = (raw as Record<string, unknown>).termChanges;
    if (candidate === undefined) return [];
    if (!isCalculationPolicy(candidate)) {
      throw new ConflictException({
        code: 'LEAVE_CALCULATION_POLICY_INVALID',
        message: 'Appointment term-change leave policy is incomplete or unsupported.',
      });
    }
    return [candidate];
  });
  const selected = configured[0];
  if (selected && configured.some((policy) => !isDeepStrictEqual(policy, selected))) {
    throw new ConflictException({
      code: 'LEAVE_CALCULATION_POLICY_CONFLICT',
      message: 'Appointment terms specify conflicting leave calculation policies.',
    });
  }
  return selected;
}

function leaveSegments(terms: Term[], bounds: YearBounds): AssignmentLeaveSegment[] {
  return terms.flatMap((term) => {
    const termBounds = termDateBounds(term);
    const from = maxDate(bounds.from, termBounds.from);
    const to = minDate(bounds.to, termBounds.to);
    if (from > to) return [];
    const weeklyHours = Number(term.weeklyHours ?? term.workTimeModel?.weeklyHours);
    if (!Number.isFinite(weeklyHours)) {
      throw new ConflictException({
        code: 'LEAVE_WEEKLY_HOURS_REQUIRED',
        message: 'Appointment term requires a weekly-hours snapshot for leave calculation.',
      });
    }
    return [{ from, to, weeklyHours, workingDays: term.workingDays, rule: leaveRule(term) }];
  });
}

function termsForBounds(terms: Term[], bounds: YearBounds): Term[] {
  return terms.filter((term) => {
    const termBounds = termDateBounds(term);
    return termBounds.from <= bounds.to && termBounds.to >= bounds.from;
  });
}

function leaveUsage(
  absences: Array<{ startDate: Date; endDate: Date }>,
  terms: Term[],
  bounds: YearBounds,
): Array<{ date: string; days: number }> {
  return absences.flatMap((absence) =>
    terms.flatMap((term) => {
      const termBounds = termDateBounds(term);
      const from = maxDate(bounds.from, dateOnly(absence.startDate), termBounds.from);
      const to = minDate(bounds.to, dateOnly(absence.endDate), termBounds.to);
      if (from > to) return [];
      const days = countAssignmentWorkingDays({
        startDate: from,
        endDate: to,
        workingDays: term.workingDays,
        holidayDates: term.holidayCalendar.holidayDates,
      });
      return days > 0 ? [{ date: from, days }] : [];
    }),
  );
}

@Injectable()
export class LeaveBalanceHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AssignmentHelper) private readonly assignmentHelper: AssignmentHelper,
  ) {}

  private defaultAsOfDate(targetYear: number): string {
    const today = new Date();
    return targetYear === today.getUTCFullYear()
      ? today.toISOString().slice(0, 10)
      : `${targetYear}-12-31`;
  }

  private calculate(input: {
    year: number;
    asOfDate: string;
    bounds: YearBounds;
    assignment: { employmentStartDate: Date | null; employmentEndDate: Date | null };
    terms: Term[];
    absences: Array<{ startDate: Date; endDate: Date }>;
    adjustments: Array<{ year: number; deltaDays: Prisma.Decimal }>;
    priorYearCarryOverDays: number;
  }) {
    try {
      const terms = termsForBounds(input.terms, input.bounds);
      const segments = leaveSegments(terms, input.bounds);
      return calculateAssignmentLeaveLedger({
        year: input.year,
        asOfDate: input.asOfDate,
        workTimeModelWeeklyHours: segments[0]?.weeklyHours ?? 0,
        employmentStartDate: input.assignment.employmentStartDate
          ? dateOnly(input.assignment.employmentStartDate)
          : undefined,
        employmentEndDate: input.assignment.employmentEndDate
          ? dateOnly(input.assignment.employmentEndDate)
          : undefined,
        priorYearCarryOverDays: input.priorYearCarryOverDays,
        annualLeaveUsage: leaveUsage(input.absences, terms, input.bounds),
        adjustments: input.adjustments.map((entry) => ({
          year: entry.year,
          deltaDays: Number(entry.deltaDays),
        })),
        segments,
        calculationPolicy: termChangePolicy(terms),
      });
    } catch (error) {
      if (error instanceof AssignmentLeaveLedgerError) {
        throw new ConflictException({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  async leaveBalance(
    user: AuthenticatedIdentity,
    year?: number,
    asOfDate?: string,
    assignmentId?: string,
  ) {
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

    const assignment = await this.assignmentHelper.selectAssignment(
      person.id,
      assignmentId,
      undefined,
      assignmentId ? undefined : asOf,
    );
    const currentBounds = assignmentBounds(assignment, targetYear);
    if (!currentBounds) {
      throw new BadRequestException('Appointment does not overlap the requested year.');
    }
    const previousYear = targetYear - 1;
    const priorBounds = assignmentBounds(assignment, previousYear);
    const rangeFrom = new Date(`${previousYear}-01-01T00:00:00.000Z`);
    const rangeTo = new Date(`${targetYear + 1}-01-01T00:00:00.000Z`);
    const terms = await this.prisma.employmentTerm.findMany({
      where: {
        assignmentId: assignment.id,
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lt: rangeTo } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: rangeFrom } }] },
        ],
      },
      include: { employmentGroup: true, holidayCalendar: true, workTimeModel: true },
      orderBy: [{ effectiveFrom: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: 201,
    });
    if (terms.length > 200) {
      throw new BadRequestException('Leave balance spans more than 200 appointment terms.');
    }

    const currentFrom = new Date(`${currentBounds.from}T00:00:00.000Z`);
    const currentTo = new Date(`${currentBounds.to}T23:59:59.999Z`);
    const priorFrom = priorBounds ? new Date(`${priorBounds.from}T00:00:00.000Z`) : null;
    const priorTo = priorBounds ? new Date(`${priorBounds.to}T23:59:59.999Z`) : null;
    const [annualLeaveAbsences, priorAnnualLeaveAbsences, adjustments] = await Promise.all([
      this.prisma.absence.findMany({
        where: {
          personId: person.id,
          assignmentId: assignment.id,
          status: AbsenceStatus.APPROVED,
          type: AbsenceType.ANNUAL_LEAVE,
          startDate: { lte: currentTo },
          endDate: { gte: currentFrom },
        },
        orderBy: { startDate: 'asc' },
      }),
      priorBounds && priorFrom && priorTo
        ? this.prisma.absence.findMany({
            where: {
              personId: person.id,
              assignmentId: assignment.id,
              status: AbsenceStatus.APPROVED,
              type: AbsenceType.ANNUAL_LEAVE,
              startDate: { lte: priorTo },
              endDate: { gte: priorFrom },
            },
            orderBy: { startDate: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.leaveAdjustment.findMany({
        where: {
          personId: person.id,
          assignmentId: assignment.id,
          year: { in: [previousYear, targetYear] },
        },
      }),
    ]);

    const priorYearCarryOverDays = priorBounds
      ? Math.max(
          this.calculate({
            year: previousYear,
            asOfDate: `${previousYear}-12-31`,
            bounds: priorBounds,
            assignment,
            terms,
            absences: priorAnnualLeaveAbsences,
            adjustments,
            priorYearCarryOverDays: 0,
          }).remainingDays,
          0,
        )
      : 0;
    const calculation = this.calculate({
      year: targetYear,
      asOfDate: resolvedAsOfDate,
      bounds: currentBounds,
      assignment,
      terms,
      absences: annualLeaveAbsences,
      adjustments,
      priorYearCarryOverDays,
    });

    return {
      personId: person.id,
      assignmentId: assignment.id,
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
