/** Centralizes roster reads and plan-versus-actual coverage calculations. */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Role } from '@cueq/database';
import { AssignmentOptionPageSchema, CursorQuerySchema, DateTimeSchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorWhere } from '../../persistence/queries/cursor-page.js';
import {
  buildRosterPlanVsActual,
  type RosterWithPlanShifts,
} from '../../application/roster/plan-vs-actual-coverage.js';
import { appointmentCoversOrganizationUnit } from '../../application/roster/appointment-eligibility.js';

const RosterMemberAssignmentsQuerySchema = CursorQuerySchema.extend({
  from: DateTimeSchema,
  to: DateTimeSchema,
}).refine((query) => Date.parse(query.from) < Date.parse(query.to), {
  message: 'to must be after from',
  path: ['to'],
});

const ASSIGNMENT_SCAN_BATCH_SIZE = 100;
const MAX_ASSIGNMENT_SCAN_BATCHES = 10;

type AssignmentCandidate = {
  id: string;
  label: string;
  legacy: boolean;
  employmentStartDate: Date | null;
  employmentEndDate: Date | null;
  createdAt: Date;
  terms: Array<{
    id: string;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    organizationUnitId: string;
  }>;
};

function encodeAssignmentCursor(candidate: Pick<AssignmentCandidate, 'id' | 'createdAt'>) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      field: 'createdAt',
      at: candidate.createdAt.toISOString(),
      id: candidate.id,
    }),
  ).toString('base64url');
}

function isEligibleAssignment(
  candidate: AssignmentCandidate,
  organizationUnitId: string,
  from: Date,
  to: Date,
) {
  if (candidate.terms.length > 100) {
    throw new BadRequestException('Appointment interval spans more than 100 term versions.');
  }
  return appointmentCoversOrganizationUnit(candidate, organizationUnitId, from, to);
}

/**
 * Centralizes roster reads and plan-versus-actual coverage calculations so visibility filters stay consistent.
 */
@Injectable()
export class RosterQueryHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async buildPlanVsActualForRoster(roster: RosterWithPlanShifts) {
    return buildRosterPlanVsActual(this.prisma, roster);
  }

  async toRosterDetail(roster: {
    id: string;
    organizationUnitId: string;
    periodStart: Date;
    periodEnd: Date;
    status: string;
    publishedAt: Date | null;
    shifts: Array<{
      id: string;
      rosterId: string;
      startTime: Date;
      endTime: Date;
      shiftType: string;
      minStaffing: number;
      assignments: Array<{
        id: string;
        personId: string;
        assignmentId: string;
        person: { firstName: string; lastName: string };
      }>;
    }>;
  }) {
    const members = await this.prisma.person.findMany({
      where: {
        role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
        employmentAssignments: {
          some: {
            AND: [
              {
                OR: [
                  { employmentStartDate: null },
                  { employmentStartDate: { lt: roster.periodEnd } },
                ],
              },
              {
                OR: [
                  { employmentEndDate: null },
                  { employmentEndDate: { gte: roster.periodStart } },
                ],
              },
            ],
            terms: {
              some: {
                organizationUnitId: roster.organizationUnitId,
                AND: [
                  {
                    OR: [{ effectiveFrom: null }, { effectiveFrom: { lt: roster.periodEnd } }],
                  },
                  {
                    OR: [{ effectiveTo: null }, { effectiveTo: { gt: roster.periodStart } }],
                  },
                ],
              },
            },
          },
        },
      },
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, role: true },
    });

    return {
      id: roster.id,
      organizationUnitId: roster.organizationUnitId,
      periodStart: roster.periodStart.toISOString(),
      periodEnd: roster.periodEnd.toISOString(),
      status: roster.status,
      publishedAt: roster.publishedAt?.toISOString() ?? null,
      shifts: roster.shifts.map((shift) => ({
        id: shift.id,
        rosterId: shift.rosterId,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
        assignments: shift.assignments.map((a) => ({
          id: a.id,
          personId: a.personId,
          assignmentId: a.assignmentId,
          firstName: a.person.firstName,
          lastName: a.person.lastName,
        })),
      })),
      members,
    };
  }

  async memberAssignmentOptions(
    roster: { organizationUnitId: string; periodStart: Date; periodEnd: Date },
    personId: string,
    query: unknown,
  ) {
    const parsed = RosterMemberAssignmentsQuerySchema.parse(query);
    const from = new Date(parsed.from);
    const to = new Date(parsed.to);
    if (from < roster.periodStart || to > roster.periodEnd) {
      throw new BadRequestException('Appointment interval must be within the roster period.');
    }

    const eligible: AssignmentCandidate[] = [];
    let scanCursor = parsed.cursor;
    let exhausted = false;
    let lastScanned: AssignmentCandidate | undefined;

    for (let batch = 0; batch < MAX_ASSIGNMENT_SCAN_BATCHES; batch += 1) {
      const candidates = await this.prisma.employmentAssignment.findMany({
        where: {
          personId,
          person: { role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] } },
          AND: [
            cursorWhere('createdAt', scanCursor),
            {
              OR: [{ employmentStartDate: null }, { employmentStartDate: { lte: from } }],
            },
            {
              OR: [{ employmentEndDate: null }, { employmentEndDate: { gte: from } }],
            },
          ],
          terms: {
            some: {
              organizationUnitId: roster.organizationUnitId,
              AND: [
                { OR: [{ effectiveFrom: null }, { effectiveFrom: { lt: to } }] },
                { OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }] },
              ],
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: ASSIGNMENT_SCAN_BATCH_SIZE + 1,
        select: {
          id: true,
          label: true,
          legacy: true,
          employmentStartDate: true,
          employmentEndDate: true,
          createdAt: true,
          terms: {
            where: {
              AND: [
                { OR: [{ effectiveFrom: null }, { effectiveFrom: { lt: to } }] },
                { OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }] },
              ],
            },
            orderBy: [{ effectiveFrom: { sort: 'asc', nulls: 'first' } }, { id: 'asc' }],
            take: 101,
            select: {
              id: true,
              effectiveFrom: true,
              effectiveTo: true,
              organizationUnitId: true,
            },
          },
        },
      });
      const scanned = candidates.slice(0, ASSIGNMENT_SCAN_BATCH_SIZE);
      for (const candidate of scanned) {
        lastScanned = candidate;
        if (isEligibleAssignment(candidate, roster.organizationUnitId, from, to)) {
          eligible.push(candidate);
        }
        if (eligible.length > parsed.limit) break;
      }
      if (eligible.length > parsed.limit) break;
      exhausted = candidates.length <= ASSIGNMENT_SCAN_BATCH_SIZE;
      if (exhausted || !lastScanned) break;
      scanCursor = encodeAssignmentCursor(lastScanned);
    }

    const items = eligible.slice(0, parsed.limit).map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      legacy: candidate.legacy,
      active: true,
    }));
    const lastReturned = eligible.at(Math.min(parsed.limit, eligible.length) - 1);
    const nextCursor =
      eligible.length > parsed.limit && lastReturned
        ? encodeAssignmentCursor(lastReturned)
        : !exhausted && lastScanned
          ? encodeAssignmentCursor(lastScanned)
          : null;
    return AssignmentOptionPageSchema.parse({ items, nextCursor });
  }
}
