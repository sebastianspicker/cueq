import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClosingLockSource, ClosingStatus, Role } from '@cueq/database';
import { applyCutoffLock } from '@cueq/core';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from './audit.helper';
import { toCoreClosingStatus } from './closing-lock.helper';
import { EventOutboxHelper } from './event-outbox.helper';
import { PersonHelper } from './person.helper';
import { HR_LIKE_ROLES } from './role-constants';
import { ClosingChecklistHelper } from './closing-checklist.helper';
import {
  allowManualReviewStart,
  toClosingActorRole,
  toPersistenceClosingStatus,
} from './closing-utils';

@Injectable()
export class ClosingLifecycleHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
    @Inject(ClosingChecklistHelper) private readonly checklistHelper: ClosingChecklistHelper,
  ) {}

  async startClosingReview(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personHelper.personForUser(user);
    if (!allowManualReviewStart()) {
      throw new ForbiddenException(
        'Manual review start is disabled. Enable CLOSING_ALLOW_MANUAL_REVIEW_START for emergency use.',
      );
    }

    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Manual review start is restricted to ADMIN role.');
    }

    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'ADVANCE_TO_REVIEW',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: transition.violations.join('; '),
        details: transition.violations,
      });
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        lockedAt: new Date(),
        lockSource: ClosingLockSource.MANUAL_REVIEW_START,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_REVIEW_STARTED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        lockSource: updated.lockSource,
        lockedAt: updated.lockedAt?.toISOString() ?? null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async leadApproveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personHelper.personForUser(user);
    if (user.role !== Role.TEAM_LEAD) {
      throw new ForbiddenException('Only TEAM_LEAD can submit lead approval.');
    }

    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    if (!period.organizationUnitId) {
      throw new BadRequestException('Global closing periods do not require team-lead approval.');
    }
    if (period.organizationUnitId !== actor.organizationUnitId) {
      throw new ForbiddenException(
        'Team leads can only approve closing periods in their own unit.',
      );
    }
    if (period.status !== ClosingStatus.REVIEW) {
      throw new BadRequestException('Lead approval is only valid while period is in REVIEW.');
    }

    if (period.leadApprovedAt) {
      return {
        ...period,
        status: toCoreClosingStatus(period.status),
      };
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        leadApprovedAt: new Date(),
        leadApprovedById: actor.id,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_LEAD_APPROVED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: {
        leadApprovedAt: null,
        leadApprovedById: period.leadApprovedById ?? null,
      },
      after: {
        leadApprovedAt: updated.leadApprovedAt?.toISOString() ?? null,
        leadApprovedById: updated.leadApprovedById ?? null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async reopenClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can reopen closing periods.');
    }

    const actor = await this.personHelper.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'REOPEN',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: transition.violations.join('; '),
        details: transition.violations,
      });
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        leadApprovedAt: null,
        leadApprovedById: null,
        hrApprovedAt: null,
        hrApprovedById: null,
        lockedAt: null,
        lockSource: null,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_REOPENED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        leadApprovedAt: null,
        hrApprovedAt: null,
        lockedAt: null,
        lockSource: null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async approveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can approve closing periods.');
    }

    const actor = await this.personHelper.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }
    if (period.organizationUnitId && !period.leadApprovedAt) {
      throw new BadRequestException(
        'Team-lead approval is required before HR can finalize this closing period.',
      );
    }

    const checklist = await this.checklistHelper.closingChecklist(user, closingPeriodId);
    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'APPROVE',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: checklist.hasErrors,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: transition.violations.join('; '),
        details: transition.violations,
      });
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        hrApprovedAt: new Date(),
        hrApprovedById: actor.id,
        closedAt: new Date(),
        closedById: actor.id,
        lockedAt: period.lockedAt ?? new Date(),
        lockSource: period.lockSource ?? ClosingLockSource.MANUAL_REVIEW_START,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_APPROVED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        hrApprovedAt: updated.hrApprovedAt?.toISOString() ?? null,
        hrApprovedById: updated.hrApprovedById,
      },
    });

    await this.eventOutboxHelper.enqueueDomainEvent({
      eventType: 'closing.completed',
      aggregateType: 'ClosingPeriod',
      aggregateId: updated.id,
      payload: {
        status: toCoreClosingStatus(updated.status),
        organizationUnitId: updated.organizationUnitId,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }
}
