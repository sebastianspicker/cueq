/** Resolves appointments and effective terms without granting cross-person access. */
import { isDeepStrictEqual } from 'node:util';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EmploymentAssignment, Prisma } from '@cueq/database';
import { EmploymentTermsError, resolveEmploymentTermsForInterval } from '@cueq/domain';
import { PrismaService } from '../../persistence/prisma.service.js';

type AssignmentClient = Pick<Prisma.TransactionClient, 'employmentAssignment' | 'employmentTerm'>;
type Term = Prisma.EmploymentTermGetPayload<{
  include: { employmentGroup: true; holidayCalendar: true; workTimeModel: true };
}>;
export type ResolvedEmployment = {
  assignment: EmploymentAssignment;
  term: Term;
  terms: Term[];
  organizationUnitId: string;
  supervisorId: string | null;
};

function configuration(term: Term) {
  return {
    organizationUnitId: term.organizationUnitId,
    supervisorId: term.supervisorId,
    workTimeModelId: term.workTimeModelId,
    weeklyHours: term.weeklyHours?.toString() ?? null,
    dailyTargetHours: term.dailyTargetHours?.toString() ?? null,
    workingDays: [...term.workingDays].sort(),
    employmentGroupId: term.employmentGroupId,
    holidayCalendarId: term.holidayCalendarId,
    policyReferences: term.policyReferences,
  };
}

function employmentCovers(assignment: EmploymentAssignment, from: Date, to?: Date): boolean {
  const start = assignment.employmentStartDate?.getTime() ?? -Infinity;
  // Employment end dates retain the existing inclusive calendar-date meaning.
  const end = assignment.employmentEndDate
    ? Date.parse(assignment.employmentEndDate.toISOString().slice(0, 10)) + 86_400_000
    : Infinity;
  return start <= from.getTime() && from.getTime() < end && (!to || to.getTime() <= end);
}

@Injectable()
export class AssignmentHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Infer only one eligible appointment; callers authorize the target person first. */
  async selectAssignment(
    personId: string,
    assignmentId?: string,
    tx: AssignmentClient = this.prisma,
    at?: Date,
    until?: Date,
  ): Promise<EmploymentAssignment> {
    if (assignmentId) {
      const assignment = await tx.employmentAssignment.findFirst({
        where: { id: assignmentId, personId },
      });
      if (!assignment) throw new NotFoundException('Employment assignment not found.');
      if (at && !employmentCovers(assignment, at, until)) {
        throw new ConflictException({
          code: 'ASSIGNMENT_NOT_EFFECTIVE',
          message: 'Appointment does not cover the requested interval.',
        });
      }
      return assignment;
    }
    const lastInstant = until && at && until > at ? new Date(until.getTime() - 1) : at;
    const dayStart = lastInstant ? new Date(lastInstant.toISOString().slice(0, 10)) : undefined;
    const assignments = await tx.employmentAssignment.findMany({
      where: {
        personId,
        ...(at
          ? {
              AND: [
                { OR: [{ employmentStartDate: null }, { employmentStartDate: { lte: at } }] },
                { OR: [{ employmentEndDate: null }, { employmentEndDate: { gte: dayStart } }] },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 2,
    });
    if (!assignments.length) throw new NotFoundException('No eligible employment assignment.');
    if (assignments.length !== 1) {
      throw new ConflictException({
        code: 'ASSIGNMENT_REQUIRED',
        message: 'Select an appointment for this request.',
      });
    }
    const assignment = assignments[0];
    if (!assignment) throw new NotFoundException('No eligible employment assignment.');
    return assignment;
  }

  /** Resolve again after acquiring the person write lock for every mutation. */
  async resolveInterval(
    personId: string,
    from: Date,
    to?: Date,
    assignmentId?: string,
    tx: AssignmentClient = this.prisma,
  ): Promise<ResolvedEmployment> {
    if (!Number.isFinite(from.getTime()) || (to && (!Number.isFinite(to.getTime()) || to < from))) {
      throw new BadRequestException('Invalid employment interval.');
    }
    const assignment = await this.selectAssignment(personId, assignmentId, tx, from, to);
    if (!employmentCovers(assignment, from, to)) {
      throw new ConflictException({
        code: 'ASSIGNMENT_NOT_EFFECTIVE',
        message: 'Appointment does not cover the requested interval.',
      });
    }
    const terms = await tx.employmentTerm.findMany({
      where: {
        assignmentId: assignment.id,
        AND: [
          {
            OR: [
              { effectiveFrom: null },
              { effectiveFrom: to && to > from ? { lt: to } : { lte: from } },
            ],
          },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }] },
        ],
      },
      include: { employmentGroup: true, holidayCalendar: true, workTimeModel: true },
      orderBy: [{ effectiveFrom: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
      take: 101,
    });
    if (terms.length > 100)
      throw new BadRequestException('Split requests covering more than 100 term versions.');
    try {
      const selected = resolveEmploymentTermsForInterval(
        terms.map((term) => ({
          ...term,
          original: term,
          effectiveFrom: term.effectiveFrom?.toISOString() ?? null,
          effectiveTo: term.effectiveTo?.toISOString() ?? null,
        })),
        from.toISOString(),
        to && to > from ? to.toISOString() : undefined,
        (left, right) =>
          isDeepStrictEqual(configuration(left.original), configuration(right.original)),
      ).map((selectedTerm) => selectedTerm.original);
      const term = selected[0];
      if (!term) throw new ConflictException('No effective appointment term.');
      return {
        assignment,
        term,
        terms: selected,
        organizationUnitId: term.organizationUnitId,
        supervisorId: term.supervisorId,
      };
    } catch (error) {
      if (error instanceof EmploymentTermsError) {
        throw new ConflictException({
          code: error.code,
          message:
            'Appointment terms do not cover this interval consistently. Split the request at the terms boundary.',
        });
      }
      throw error;
    }
  }

  async assertUnchanged(
    tx: AssignmentClient,
    expected: ResolvedEmployment,
    from: Date,
    to?: Date,
  ): Promise<ResolvedEmployment> {
    const current = await this.resolveInterval(
      expected.assignment.personId,
      from,
      to,
      expected.assignment.id,
      tx,
    );
    if (!isDeepStrictEqual(configuration(current.term), configuration(expected.term))) {
      throw new ConflictException({
        code: 'ASSIGNMENT_CHANGED',
        message: 'Appointment terms changed; retry the request.',
        retryable: true,
      });
    }
    return current;
  }
}
