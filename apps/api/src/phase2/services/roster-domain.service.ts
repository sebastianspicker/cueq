import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Prisma } from '@cueq/database';
import { CreateRosterSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';
import { AuditHelper } from '../helpers/audit.helper';
import { ClosingLockHelper } from '../helpers/closing-lock.helper';
import { HR_LIKE_ROLES } from '../helpers/role-constants';
import { assignedPersonIdsForShift } from '../helpers/roster-utils';
import { RosterShiftHelper } from '../helpers/roster-shift.helper';
import { RosterAssignmentHelper } from '../helpers/roster-assignment.helper';
import { RosterQueryHelper } from '../helpers/roster-query.helper';

const ROSTER_DETAIL_INCLUDE = {
  shifts: {
    include: {
      assignments: {
        include: {
          person: {
            select: { firstName: true, lastName: true },
          },
        },
      },
    },
    orderBy: { startTime: 'asc' as const },
  },
} satisfies Prisma.RosterInclude;

@Injectable()
export class RosterDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
    @Inject(RosterShiftHelper) private readonly shiftHelper: RosterShiftHelper,
    @Inject(RosterAssignmentHelper) private readonly assignmentHelper: RosterAssignmentHelper,
    @Inject(RosterQueryHelper) private readonly queryHelper: RosterQueryHelper,
  ) {}

  /* ── Private helpers ────────────────────────────────────────── */

  private assertCanReadRoster(user: AuthenticatedIdentity, actorOuId: string, rosterOuId: string) {
    if (HR_LIKE_ROLES.has(user.role)) {
      return;
    }
    if (actorOuId !== rosterOuId) {
      throw new ForbiddenException('Roster access is limited to the same organization unit.');
    }
  }

  /* ── Public methods ─────────────────────────────────────────── */

  async createRoster(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personHelper.personForUser(user);
    const parsed = CreateRosterSchema.parse(payload);

    this.shiftHelper.assertCanWriteRoster(
      user,
      actor.organizationUnitId,
      parsed.organizationUnitId,
    );

    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: parsed.organizationUnitId,
      from: new Date(parsed.periodStart),
      to: new Date(parsed.periodEnd),
      attemptedAction: 'ROSTER_CREATE',
      entityType: 'Roster',
      entityId: `${parsed.organizationUnitId}:${parsed.periodStart}`,
    });

    const periodStart = new Date(parsed.periodStart);
    const periodEnd = new Date(parsed.periodEnd);
    const overlap = await this.prisma.roster.findFirst({
      where: {
        organizationUnitId: parsed.organizationUnitId,
        periodStart: { lt: periodEnd },
        periodEnd: { gt: periodStart },
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
      select: { id: true },
    });

    if (overlap) {
      throw new BadRequestException('A roster already exists for the given overlapping period.');
    }

    const roster = await this.prisma.roster.create({
      data: {
        organizationUnitId: parsed.organizationUnitId,
        periodStart,
        periodEnd,
        status: 'DRAFT',
      },
      include: ROSTER_DETAIL_INCLUDE,
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'ROSTER_CREATED',
      entityType: 'Roster',
      entityId: roster.id,
      after: {
        organizationUnitId: roster.organizationUnitId,
        periodStart: roster.periodStart.toISOString(),
        periodEnd: roster.periodEnd.toISOString(),
        status: roster.status,
      },
    });

    return this.queryHelper.toRosterDetail(roster);
  }

  async rosterById(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personHelper.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: ROSTER_DETAIL_INCLUDE,
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanReadRoster(user, actor.organizationUnitId, roster.organizationUnitId);
    return this.queryHelper.toRosterDetail(roster);
  }

  async publishRoster(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personHelper.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        shifts: {
          include: { assignments: { select: { personId: true } } },
        },
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.shiftHelper.assertCanWriteRoster(
      user,
      actor.organizationUnitId,
      roster.organizationUnitId,
    );
    this.shiftHelper.assertRosterIsDraft(roster.status);
    await this.closingLockHelper.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: roster.organizationUnitId,
      from: roster.periodStart,
      to: roster.periodEnd,
      attemptedAction: 'ROSTER_PUBLISH',
      entityType: 'Roster',
      entityId: roster.id,
    });

    const shortfalls = roster.shifts
      .map((shift) => {
        const assigned = assignedPersonIdsForShift(shift).length;
        const shortfall = Math.max(shift.minStaffing - assigned, 0);
        return { shiftId: shift.id, required: shift.minStaffing, assigned, shortfall };
      })
      .filter((entry) => entry.shortfall > 0);

    if (shortfalls.length > 0) {
      throw new BadRequestException({
        message: 'Cannot publish roster due to staffing shortfalls.',
        shortfalls,
      });
    }

    const updated = await this.prisma.roster.update({
      where: { id: roster.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'ROSTER_PUBLISHED',
      entityType: 'Roster',
      entityId: updated.id,
      before: { status: roster.status },
      after: {
        status: updated.status,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
    };
  }

  async currentRoster(user: AuthenticatedIdentity) {
    const person = await this.personHelper.personForUser(user);
    const now = new Date();

    const roster = await this.prisma.roster.findFirst({
      where: {
        organizationUnitId: person.organizationUnitId,
        status: 'PUBLISHED',
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      include: ROSTER_DETAIL_INCLUDE,
    });

    if (!roster) {
      throw new NotFoundException('No current roster found for this organization unit.');
    }

    return this.queryHelper.toRosterDetail(roster);
  }

  async rosterPlanVsActual(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personHelper.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        shifts: {
          include: { assignments: { select: { personId: true } } },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanReadRoster(user, actor.organizationUnitId, roster.organizationUnitId);
    const result = await this.queryHelper.buildPlanVsActualForRoster(roster);

    return {
      rosterId: roster.id,
      periodStart: roster.periodStart.toISOString(),
      periodEnd: roster.periodEnd.toISOString(),
      ...result,
    };
  }

  /* ── Delegated to Helpers ────────────────────────────────────── */

  async createRosterShift(user: AuthenticatedIdentity, rosterId: string, payload: unknown) {
    return this.shiftHelper.createRosterShift(user, rosterId, payload);
  }

  async updateRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    payload: unknown,
  ) {
    return this.shiftHelper.updateRosterShift(user, rosterId, shiftId, payload);
  }

  async deleteRosterShift(user: AuthenticatedIdentity, rosterId: string, shiftId: string) {
    return this.shiftHelper.deleteRosterShift(user, rosterId, shiftId);
  }

  async assignRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    payload: unknown,
  ) {
    return this.assignmentHelper.assignRosterShift(user, rosterId, shiftId, payload);
  }

  async unassignRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    assignmentId: string,
  ) {
    return this.assignmentHelper.unassignRosterShift(user, rosterId, shiftId, assignmentId);
  }
}
