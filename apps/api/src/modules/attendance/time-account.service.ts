/** Creates, recalculates, lists, and explicitly reconciles appointment time accounts. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClosingStatus,
  Role,
  TimeTypeCategory,
  WorkflowStatus,
  WorkflowType,
} from '@cueq/database';
import type { Prisma } from '@cueq/database';
import { SplitTimeAccountSchema, TimeAccountQuerySchema } from '@cueq/contracts';
import type {
  TimeAccountClosingPeriod,
  TimeAccountReadClient,
  TimeAccountsPort,
} from '../../application/ports/time-accounts.port.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import {
  lockClosingPeriodWrites,
  lockEmploymentPopulationWrites,
  lockPersonWrites,
} from '../../platform/transactions/transaction-lock.helper.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { AuditHelper } from '../audit/public.js';
import { AssignmentHelper, PersonHelper } from '../people/public.js';
import {
  actualHoursForInterval,
  roundAccountHours,
  targetHoursForInterval,
} from './time-account-calculation.helper.js';

type AccountRow = Prisma.TimeAccountGetPayload<object>;
type PlannedSegment = {
  personId: string;
  assignmentId: string;
  periodStart: Date;
  periodEnd: Date;
  calculationEnd: Date;
  targetHours: number;
  actualHours: number;
  balance: number;
};

function accountDto(account: AccountRow) {
  return {
    ...account,
    periodStart: account.periodStart.toISOString(),
    periodEnd: account.periodEnd.toISOString(),
    targetHours: account.targetHours.toNumber(),
    actualHours: account.actualHours.toNumber(),
    balance: account.balance.toNumber(),
    overtimeHours: account.overtimeHours.toNumber(),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function intervalKey(from: Date, to: Date): string {
  return `${from.toISOString()}|${to.toISOString()}`;
}

function intervalsOverlap(left: { periodStart: Date; periodEnd: Date }, right: PlannedSegment) {
  return left.periodStart < right.calculationEnd && left.periodEnd > right.periodStart;
}

function reconciliationRequired(message: string): ConflictException {
  return new ConflictException({ code: 'TIME_ACCOUNT_RECONCILIATION_REQUIRED', message });
}

function accountMatchesCalculation(account: AccountRow, segment: PlannedSegment): boolean {
  return (
    Math.abs(account.targetHours.toNumber() - segment.targetHours) < 0.005 &&
    Math.abs(account.actualHours.toNumber() - segment.actualHours) < 0.005 &&
    Math.abs(account.balance.toNumber() - segment.balance) < 0.005
  );
}

function inclusivePeriodEndToExclusive(periodEnd: Date): Date {
  if (
    periodEnd.getUTCHours() === 23 &&
    periodEnd.getUTCMinutes() === 59 &&
    periodEnd.getUTCSeconds() === 59
  ) {
    return new Date(
      Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), periodEnd.getUTCDate() + 1),
    );
  }
  return new Date(periodEnd.getTime() + 1);
}

@Injectable()
export class TimeAccountService implements TimeAccountsPort {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(AssignmentHelper) private readonly assignments: AssignmentHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLocks: ClosingLockHelper,
  ) {}

  async listMine(user: AuthenticatedIdentity, query: unknown) {
    const actor = await this.people.personForUser(user);
    const input = parseRequest(TimeAccountQuerySchema, query);
    const personId = input.personId ?? actor.id;
    if (personId !== actor.id && user.role !== Role.HR && user.role !== Role.ADMIN) {
      throw new ForbiddenException("Only HR/Admin can read another person's time accounts.");
    }
    const assignment = await this.assignments.selectAssignment(personId, input.assignmentId);
    const rows = await this.prisma.timeAccount.findMany({
      where: {
        personId,
        assignmentId: assignment.id,
        ...cursorWhere('periodStart', input.cursor),
      },
      orderBy: [{ periodStart: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(rows, input.limit, 'periodStart', (row) => row.periodStart, accountDto);
  }

  async prepareClosingPeriod(actorId: string, closingPeriodId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockClosingPeriodWrites(tx, closingPeriodId);
      await lockEmploymentPopulationWrites(tx);
      const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
      if (!period) throw new NotFoundException('Closing period not found.');
      if (period.status !== ClosingStatus.OPEN) {
        throw new ConflictException(
          'Time accounts can only be prepared while the closing period is OPEN.',
        );
      }
      const plan = await this.buildPlan(tx, period);
      await lockPersonWrites(
        tx,
        plan.segments.map((segment) => segment.personId),
      );
      const current = await this.buildPlan(tx, period);
      const coverage = await this.loadCoverage(tx, period, current.segments);
      if (coverage.incompatible) {
        throw reconciliationRequired(
          'An existing appointment account has incompatible boundaries; split it explicitly before preparing accounts.',
        );
      }
      let created = 0;
      let existing = 0;
      for (const segment of current.segments) {
        const key = `${segment.assignmentId}|${intervalKey(segment.periodStart, segment.periodEnd)}`;
        const account = coverage.exact.get(key);
        const values = {
          targetHours: segment.targetHours,
          actualHours: segment.actualHours,
          balance: segment.balance,
        };
        if (account) {
          existing += 1;
          await tx.timeAccount.update({ where: { id: account.id }, data: values });
        } else {
          created += 1;
          await tx.timeAccount.create({
            data: {
              personId: segment.personId,
              assignmentId: segment.assignmentId,
              periodStart: segment.periodStart,
              periodEnd: segment.periodEnd,
              ...values,
            },
          });
        }
      }
      await this.audit.appendAudit(
        {
          actorId,
          action: 'TIME_ACCOUNTS_PREPARED',
          entityType: 'ClosingPeriod',
          entityId: closingPeriodId,
          after: { created, existing, recalculated: existing },
        },
        tx,
      );
      return { closingPeriodId, created, existing };
    });
  }

  async countMissingForClosing(tx: TimeAccountReadClient, period: TimeAccountClosingPeriod) {
    await lockEmploymentPopulationWrites(tx);
    const plan = await this.buildPlan(tx, period);
    const coverage = await this.loadCoverage(tx, period, plan.segments);
    const missing = plan.segments.reduce((count, segment) => {
      const key = `${segment.assignmentId}|${intervalKey(segment.periodStart, segment.periodEnd)}`;
      const account = coverage.exact.get(key);
      return count + (account && accountMatchesCalculation(account, segment) ? 0 : 1);
    }, 0);
    return missing + (coverage.incompatible ? 1 : 0);
  }

  async assertCompleteForClosing(tx: TimeAccountReadClient, period: TimeAccountClosingPeriod) {
    if ((await this.countMissingForClosing(tx, period)) > 0) {
      throw new ConflictException({
        code: 'MISSING_TIME_ACCOUNTS',
        message: 'Prepare and reconcile every eligible appointment account before export.',
      });
    }
  }

  async split(user: AuthenticatedIdentity, accountId: string, payload: unknown) {
    if (user.role !== Role.HR && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only HR/Admin can split time accounts.');
    }
    const actor = await this.people.personForUser(user);
    const input = parseRequest(SplitTimeAccountSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.timeAccount.findUnique({ where: { id: accountId } });
      if (!initial) throw new NotFoundException('Time account not found.');
      const termWhere = {
        assignmentId: initial.assignmentId,
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lt: initial.periodEnd } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: initial.periodStart } }] },
        ],
      } satisfies Prisma.EmploymentTermWhereInput;
      const terms = await tx.employmentTerm.findMany({
        where: termWhere,
        select: { organizationUnitId: true },
      });
      const organizationUnitIds = [...new Set(terms.map((term) => term.organizationUnitId))];
      if (!organizationUnitIds.length) {
        throw reconciliationRequired(
          'The account has no effective appointment term and cannot be split safely.',
        );
      }
      await this.closingLocks.assertClosingPeriodsUnlockedForRangesInTransaction(
        organizationUnitIds.map((organizationUnitId) => ({
          actorId: actor.id,
          organizationUnitId,
          from: initial.periodStart,
          to: initial.periodEnd,
          attemptedAction: 'TIME_ACCOUNT_SPLIT',
          entityType: 'TimeAccount',
          entityId: accountId,
        })),
        tx,
      );
      await lockEmploymentPopulationWrites(tx);
      const currentOrganizationUnitIds = [
        ...new Set(
          (
            await tx.employmentTerm.findMany({
              where: termWhere,
              select: { organizationUnitId: true },
            })
          ).map((term) => term.organizationUnitId),
        ),
      ];
      if (
        currentOrganizationUnitIds.length !== organizationUnitIds.length ||
        currentOrganizationUnitIds.some((id) => !organizationUnitIds.includes(id))
      ) {
        throw new ConflictException('Appointment terms changed. Retry the split.');
      }
      await lockPersonWrites(tx, [initial.personId]);
      const account = await tx.timeAccount.findUniqueOrThrow({ where: { id: accountId } });
      if (account.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
        throw new ConflictException('Time account changed. Reload before splitting.');
      }
      this.validateSplitCoverage(account, input.segments);
      const pendingWorkflow = await tx.workflowInstance.findFirst({
        where: {
          type: WorkflowType.OVERTIME_APPROVAL,
          entityType: 'TimeAccount',
          entityId: account.id,
          status: {
            in: [
              WorkflowStatus.DRAFT,
              WorkflowStatus.SUBMITTED,
              WorkflowStatus.PENDING,
              WorkflowStatus.ESCALATED,
            ],
          },
        },
        select: { id: true },
      });
      if (pendingWorkflow) {
        throw new ConflictException(
          'Resolve pending overtime workflows before splitting this account.',
        );
      }
      const otherAccounts = await tx.timeAccount.findMany({
        where: {
          assignmentId: account.assignmentId,
          id: { not: account.id },
          periodStart: { lt: account.periodEnd },
          periodEnd: { gt: account.periodStart },
        },
        select: { id: true },
      });
      if (otherAccounts.length)
        throw reconciliationRequired('Replacement segments overlap another account.');
      for (const segment of input.segments) {
        await this.assignments.resolveInterval(
          account.personId,
          new Date(segment.periodStart),
          new Date(segment.periodEnd),
          account.assignmentId,
          tx,
        );
      }
      const [first, ...remaining] = input.segments;
      if (!first) throw new BadRequestException('At least two replacement segments are required.');
      const updated = await tx.timeAccount.update({
        where: { id: account.id },
        data: this.splitData(first),
      });
      const created: AccountRow[] = [];
      for (const segment of remaining) {
        created.push(
          await tx.timeAccount.create({
            data: {
              personId: account.personId,
              assignmentId: account.assignmentId,
              ...this.splitData(segment),
            },
          }),
        );
      }
      const result = [updated, ...created];
      await this.audit.appendAudit(
        {
          actorId: actor.id,
          action: 'TIME_ACCOUNT_SPLIT',
          entityType: 'TimeAccount',
          entityId: account.id,
          before: this.auditAccount(account),
          after: { reason: input.reason, segments: result.map((row) => this.auditAccount(row)) },
          reason: input.reason,
        },
        tx,
      );
      return result.map(accountDto);
    });
  }

  private validateSplitCoverage(
    account: AccountRow,
    segments: Array<{
      periodStart: string;
      periodEnd: string;
      targetHours: number;
      actualHours: number;
      balance: number;
      overtimeHours: number;
    }>,
  ) {
    const ordered = segments.map((segment) => ({
      ...segment,
      start: new Date(segment.periodStart),
      end: new Date(segment.periodEnd),
    }));
    if (
      ordered[0]?.start.getTime() !== account.periodStart.getTime() ||
      ordered.at(-1)?.end.getTime() !== account.periodEnd.getTime() ||
      ordered.some(
        (segment, index) =>
          index > 0 && ordered[index - 1]?.end.getTime() !== segment.start.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Replacement segments must contiguously cover the original interval.',
      );
    }
    const totals = {
      targetHours: roundAccountHours(
        ordered.reduce((sum, segment) => sum + segment.targetHours, 0),
      ),
      actualHours: roundAccountHours(
        ordered.reduce((sum, segment) => sum + segment.actualHours, 0),
      ),
      balance: roundAccountHours(ordered.reduce((sum, segment) => sum + segment.balance, 0)),
      overtimeHours: roundAccountHours(
        ordered.reduce((sum, segment) => sum + segment.overtimeHours, 0),
      ),
    };
    const original = {
      targetHours: account.targetHours.toNumber(),
      actualHours: account.actualHours.toNumber(),
      balance: account.balance.toNumber(),
      overtimeHours: account.overtimeHours.toNumber(),
    };
    if (
      Object.keys(totals).some(
        (key) =>
          Math.abs(totals[key as keyof typeof totals] - original[key as keyof typeof original]) >=
          0.005,
      )
    ) {
      throw new BadRequestException(
        'Replacement segments must preserve target, actual, balance and approved overtime totals.',
      );
    }
  }

  private splitData(segment: {
    periodStart: string;
    periodEnd: string;
    targetHours: number;
    actualHours: number;
    balance: number;
    overtimeHours: number;
  }) {
    return {
      periodStart: new Date(segment.periodStart),
      periodEnd: new Date(segment.periodEnd),
      targetHours: segment.targetHours,
      actualHours: segment.actualHours,
      balance: segment.balance,
      overtimeHours: segment.overtimeHours,
    };
  }

  private auditAccount(account: AccountRow) {
    return {
      id: account.id,
      assignmentId: account.assignmentId,
      periodStart: account.periodStart.toISOString(),
      periodEnd: account.periodEnd.toISOString(),
      targetHours: account.targetHours.toNumber(),
      actualHours: account.actualHours.toNumber(),
      balance: account.balance.toNumber(),
      overtimeHours: account.overtimeHours.toNumber(),
    };
  }

  private async loadCoverage(
    tx: TimeAccountReadClient,
    period: TimeAccountClosingPeriod,
    segments: PlannedSegment[],
  ) {
    const assignmentIds = [...new Set(segments.map((segment) => segment.assignmentId))];
    if (!assignmentIds.length) return { exact: new Map<string, AccountRow>(), incompatible: false };
    const accounts = await tx.timeAccount.findMany({
      where: {
        assignmentId: { in: assignmentIds },
        periodStart: { lte: period.periodEnd },
        periodEnd: { gte: period.periodStart },
      },
    });
    const exact = new Map<string, AccountRow>();
    let incompatible = false;
    for (const account of accounts) {
      const key = `${account.assignmentId}|${intervalKey(account.periodStart, account.periodEnd)}`;
      const expected = segments.find(
        (segment) =>
          segment.assignmentId === account.assignmentId &&
          segment.periodStart.getTime() === account.periodStart.getTime() &&
          segment.periodEnd.getTime() === account.periodEnd.getTime(),
      );
      if (expected) exact.set(key, account);
      else if (
        segments.some(
          (segment) =>
            segment.assignmentId === account.assignmentId && intervalsOverlap(account, segment),
        )
      ) {
        incompatible = true;
      }
    }
    return { exact, incompatible };
  }

  private async buildPlan(
    tx: TimeAccountReadClient,
    period: TimeAccountClosingPeriod,
  ): Promise<{ segments: PlannedSegment[] }> {
    const assignments = await tx.employmentAssignment.findMany({
      where: {
        person: { role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] } },
        AND: [
          {
            OR: [{ employmentStartDate: null }, { employmentStartDate: { lte: period.periodEnd } }],
          },
          { OR: [{ employmentEndDate: null }, { employmentEndDate: { gte: period.periodStart } }] },
        ],
        ...(period.organizationUnitId
          ? {
              terms: {
                some: {
                  organizationUnitId: period.organizationUnitId,
                  AND: [
                    { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: period.periodEnd } }] },
                    { OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.periodStart } }] },
                  ],
                },
              },
            }
          : {}),
      },
      include: {
        terms: {
          where: {
            AND: [
              { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: period.periodEnd } }] },
              { OR: [{ effectiveTo: null }, { effectiveTo: { gt: period.periodStart } }] },
            ],
          },
          include: { holidayCalendar: true },
          orderBy: [{ effectiveFrom: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
        },
      },
      orderBy: [{ personId: 'asc' }, { id: 'asc' }],
    });
    const segments: PlannedSegment[] = [];
    const periodEndExclusive = inclusivePeriodEndToExclusive(period.periodEnd);
    for (const assignment of assignments) {
      const employmentStart = assignment.employmentStartDate ?? period.periodStart;
      const employmentEnd = assignment.employmentEndDate
        ? new Date(assignment.employmentEndDate.getTime() + 86_400_000)
        : periodEndExclusive;
      const assignmentStart = new Date(
        Math.max(period.periodStart.getTime(), employmentStart.getTime()),
      );
      const assignmentEnd = new Date(
        Math.min(periodEndExclusive.getTime(), employmentEnd.getTime()),
      );
      const termSegments = assignment.terms
        .map((term) => ({
          term,
          start: new Date(
            Math.max(assignmentStart.getTime(), term.effectiveFrom?.getTime() ?? -Infinity),
          ),
          end: new Date(Math.min(assignmentEnd.getTime(), term.effectiveTo?.getTime() ?? Infinity)),
        }))
        .filter((segment) => segment.start < segment.end);
      let coverageCursor = assignmentStart;
      for (const segment of termSegments) {
        if (segment.start.getTime() !== coverageCursor.getTime()) {
          throw reconciliationRequired(
            segment.start < coverageCursor
              ? 'Appointment terms overlap inside the closing period.'
              : 'Appointment terms do not continuously cover the closing period.',
          );
        }
        coverageCursor = segment.end;
      }
      if (coverageCursor.getTime() !== assignmentEnd.getTime()) {
        throw reconciliationRequired(
          'Appointment terms do not continuously cover the closing period.',
        );
      }
      const bookings = await tx.booking.findMany({
        where: {
          personId: assignment.personId,
          assignmentId: assignment.id,
          endTime: { not: null, gt: period.periodStart },
          startTime: { lt: periodEndExclusive },
          timeType: { category: { in: [TimeTypeCategory.WORK, TimeTypeCategory.DEPLOYMENT] } },
        },
        select: { startTime: true, endTime: true },
      });
      for (const { term, start, end: calculationEnd } of termSegments) {
        if (period.organizationUnitId && term.organizationUnitId !== period.organizationUnitId) {
          continue;
        }
        const end =
          calculationEnd.getTime() === periodEndExclusive.getTime()
            ? period.periodEnd
            : calculationEnd;
        const targetHours = targetHoursForInterval(term, start, calculationEnd);
        const actualHours = actualHoursForInterval(bookings, start, calculationEnd);
        segments.push({
          personId: assignment.personId,
          assignmentId: assignment.id,
          periodStart: start,
          periodEnd: end,
          calculationEnd,
          targetHours,
          actualHours,
          balance: roundAccountHours(actualHours - targetHours),
        });
      }
    }
    return { segments };
  }
}
