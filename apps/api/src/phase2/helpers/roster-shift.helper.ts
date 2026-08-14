/** Performs guarded roster shift mutations within organization and closing constraints. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Role } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { PersonHelper } from './person.helper.js';
import { AuditHelper } from './audit.helper.js';
import { ClosingLockHelper } from './closing-lock.helper.js';
import {
  createRosterShiftMutation,
  deleteRosterShiftMutation,
  updateRosterShiftMutation,
} from './roster-shift-mutation.helper.js';

const ROSTER_WRITE_ROLES = new Set<Role>([Role.SHIFT_PLANNER, Role.HR, Role.ADMIN]);
const CROSS_UNIT_ROSTER_WRITE_ROLES = new Set<Role>([Role.HR, Role.ADMIN]);

/** Rejects a mutation when the shift scope changed after closing checks were evaluated. */
export function assertRosterClosingGuardIsCurrent(
  guarded: { organizationUnitId: string | null; from: Date; to: Date },
  current: { organizationUnitId: string | null; from: Date; to: Date },
) {
  if (
    guarded.organizationUnitId === current.organizationUnitId &&
    guarded.from.getTime() === current.from.getTime() &&
    guarded.to.getTime() === current.to.getTime()
  ) {
    return;
  }

  throw new ConflictException({
    code: 'ROSTER_SHIFT_CHANGED',
    message: 'Shift changed while the roster mutation was being prepared. Retry the request.',
    retryable: true,
  });
}

/**
 * Performs lock-aware roster shift mutations while preserving draft-only, organization, and closing invariants.
 */
@Injectable()
export class RosterShiftHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLockHelper: ClosingLockHelper,
  ) {}

  assertCanWriteRoster(user: AuthenticatedIdentity, actorOuId: string, rosterOuId: string) {
    if (!ROSTER_WRITE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only shift planners, HR, or admins can modify rosters.');
    }
    if (!CROSS_UNIT_ROSTER_WRITE_ROLES.has(user.role) && actorOuId !== rosterOuId) {
      throw new ForbiddenException('Shift planners can only modify rosters in their own unit.');
    }
  }

  assertRosterIsDraft(status: string) {
    if (status !== 'DRAFT') {
      throw new BadRequestException('Roster is not editable unless status is DRAFT.');
    }
  }

  private assertShiftInsideRoster(
    roster: { periodStart: Date; periodEnd: Date },
    start: Date,
    end: Date,
  ) {
    if (start >= end) {
      throw new BadRequestException('Shift startTime must be before endTime.');
    }
    if (start < roster.periodStart || end > roster.periodEnd) {
      throw new BadRequestException('Shift interval must be inside roster period.');
    }
  }

  async ensureNoOverlappingAssignedShift(
    personId: string,
    startTime: Date,
    endTime: Date,
    excludeShiftId?: string,
    db: Pick<PrismaService, 'shiftAssignment'> = this.prisma,
  ) {
    const conflicting = await db.shiftAssignment.findFirst({
      where: {
        personId,
        shift: {
          id: excludeShiftId ? { not: excludeShiftId } : undefined,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      },
      include: {
        shift: {
          select: { id: true, startTime: true, endTime: true },
        },
      },
    });

    if (!conflicting) {
      return;
    }

    throw new BadRequestException({
      message: 'Person already has an overlapping assigned shift.',
      conflict: {
        shiftId: conflicting.shift.id,
        startTime: conflicting.shift.startTime.toISOString(),
        endTime: conflicting.shift.endTime.toISOString(),
      },
    });
  }

  async createRosterShift(user: AuthenticatedIdentity, rosterId: string, payload: unknown) {
    return createRosterShiftMutation(this.mutationDependencies(), user, rosterId, payload);
  }

  async updateRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    payload: unknown,
  ) {
    return updateRosterShiftMutation(this.mutationDependencies(), user, rosterId, shiftId, payload);
  }

  async deleteRosterShift(user: AuthenticatedIdentity, rosterId: string, shiftId: string) {
    return deleteRosterShiftMutation(this.mutationDependencies(), user, rosterId, shiftId);
  }

  private mutationDependencies() {
    return {
      prisma: this.prisma,
      personForUser: (user: AuthenticatedIdentity) => this.personHelper.personForUser(user),
      appendAudit: this.auditHelper.appendAudit.bind(this.auditHelper),
      closingLockHelper: this.closingLockHelper,
      assertCanWriteRoster: this.assertCanWriteRoster.bind(this),
      assertRosterIsDraft: this.assertRosterIsDraft.bind(this),
      assertShiftInsideRoster: this.assertShiftInsideRoster.bind(this),
      assertClosingGuardIsCurrent: assertRosterClosingGuardIsCurrent,
      ensureNoOverlappingAssignedShift: (
        personId: string,
        startTime: Date,
        endTime: Date,
        excludeShiftId: string | undefined,
        db: Pick<PrismaService, 'shiftAssignment'>,
      ) => this.ensureNoOverlappingAssignedShift(personId, startTime, endTime, excludeShiftId, db),
    };
  }
}
