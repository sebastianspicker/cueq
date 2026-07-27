/** Handles audited manual review, approval, and reopen transitions for closing periods. */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClosingPeriod, Prisma } from '@cueq/database';
import { ClosingLockSource, ClosingStatus, Role } from '@cueq/database';
import { applyCutoffLock } from '@cueq/core';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { AuditHelper } from './audit.helper.js';
import { toCoreClosingStatus } from './closing-lock.helper.js';
import { EventOutboxHelper } from './event-outbox.helper.js';
import { PersonHelper } from './person.helper.js';
import { HR_LIKE_ROLES } from './role-constants.js';
import { ClosingChecklistHelper } from './closing-checklist.helper.js';
import { lockClosingPeriodWrites } from './transaction-lock.helper.js';
import {
  allowManualReviewStart,
  toClosingActorRole,
  toPersistenceClosingStatus,
} from './closing-utils.js';

function toCoreClosingPeriod(period: ClosingPeriod) {
  return { ...period, status: toCoreClosingStatus(period.status) };
}

/**
 * Applies manual closing-status transitions and emits their audit evidence.
 * Automatic cutoff and payroll export use their dedicated transactional helpers.
 */
@Injectable()
export class ClosingLifecycleHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
    @Inject(ClosingChecklistHelper) private readonly checklistHelper: ClosingChecklistHelper,
  ) {}

  /**
   * Applies a closing-period state transition, persists the update, and writes
   * an audit entry. Throws BadRequestException if the transition is invalid.
   */
  private async applyTransitionWithAudit(opts: {
    period: ClosingPeriod;
    action: 'ADVANCE_TO_REVIEW' | 'APPROVE' | 'EXPORT' | 'REOPEN' | 'POST_CLOSE_CORRECTION';
    actorId: string;
    actorRole: ReturnType<typeof toClosingActorRole>;
    checklistHasErrors: boolean;
    dbData: Prisma.ClosingPeriodUpdateInput;
    auditAction: string;
    auditAfter: Prisma.JsonObject;
    tx: Prisma.TransactionClient;
  }): Promise<ClosingPeriod> {
    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(opts.period.status),
      action: opts.action,
      actorRole: opts.actorRole,
      checklistHasErrors: opts.checklistHasErrors,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: transition.violations.join('; '),
        details: transition.violations,
      });
    }

    const updated = await opts.tx.closingPeriod.update({
      where: { id: opts.period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        ...opts.dbData,
      },
    });

    await this.auditHelper.appendAudit(
      {
        actorId: opts.actorId,
        action: opts.auditAction,
        entityType: 'ClosingPeriod',
        entityId: updated.id,
        before: { status: opts.period.status },
        after: opts.auditAfter,
      },
      opts.tx,
    );

    return updated;
  }

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

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockClosingPeriodWrites(tx, closingPeriodId);
      const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
      if (!period) {
        throw new NotFoundException('Closing period not found.');
      }
      const now = new Date();

      return this.applyTransitionWithAudit({
        period,
        action: 'ADVANCE_TO_REVIEW',
        actorId: actor.id,
        actorRole: toClosingActorRole(actor.role),
        checklistHasErrors: false,
        dbData: { lockedAt: now, lockSource: ClosingLockSource.MANUAL_REVIEW_START },
        auditAction: 'CLOSING_REVIEW_STARTED',
        auditAfter: {
          status: toPersistenceClosingStatus('REVIEW'),
          lockSource: ClosingLockSource.MANUAL_REVIEW_START,
          lockedAt: now.toISOString(),
        },
        tx,
      });
    });

    return toCoreClosingPeriod(updated);
  }

  async leadApproveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personHelper.personForUser(user);
    if (user.role !== Role.TEAM_LEAD) {
      throw new ForbiddenException('Only TEAM_LEAD can submit lead approval.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await lockClosingPeriodWrites(tx, closingPeriodId);
      const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
      if (!period) throw new NotFoundException('Closing period not found.');
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
      if (period.leadApprovedAt) return period;

      const approved = await tx.closingPeriod.update({
        where: { id: period.id },
        data: { leadApprovedAt: new Date(), leadApprovedById: actor.id },
      });
      await this.auditHelper.appendAudit(
        {
          actorId: actor.id,
          action: 'CLOSING_LEAD_APPROVED',
          entityType: 'ClosingPeriod',
          entityId: approved.id,
          before: { leadApprovedAt: null, leadApprovedById: period.leadApprovedById ?? null },
          after: {
            leadApprovedAt: approved.leadApprovedAt?.toISOString() ?? null,
            leadApprovedById: approved.leadApprovedById ?? null,
          },
        },
        tx,
      );
      return approved;
    });

    return toCoreClosingPeriod(updated);
  }

  async reopenClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can reopen closing periods.');
    }

    const actor = await this.personHelper.personForUser(user);
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockClosingPeriodWrites(tx, closingPeriodId);
      const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
      if (!period) throw new NotFoundException('Closing period not found.');
      return this.applyTransitionWithAudit({
        period,
        action: 'REOPEN',
        actorId: actor.id,
        actorRole: toClosingActorRole(actor.role),
        checklistHasErrors: false,
        dbData: {
          leadApprovedAt: null,
          leadApprovedById: null,
          hrApprovedAt: null,
          hrApprovedById: null,
          lockedAt: null,
          lockSource: null,
        },
        auditAction: 'CLOSING_REOPENED',
        auditAfter: { leadApprovedAt: null, hrApprovedAt: null, lockedAt: null, lockSource: null },
        tx,
      });
    });

    return toCoreClosingPeriod(updated);
  }

  async approveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can approve closing periods.');
    }

    const actor = await this.personHelper.personForUser(user);
    // Preserve the durable violation event produced by a failed checklist while
    // calculating the decisive checklist again under the closing-period lock.
    await this.checklistHelper.closingChecklist(user, closingPeriodId);
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await lockClosingPeriodWrites(tx, closingPeriodId);
      const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
      if (!period) throw new NotFoundException('Closing period not found.');
      if (period.organizationUnitId && !period.leadApprovedAt) {
        throw new BadRequestException(
          'Team-lead approval is required before HR can finalize this closing period.',
        );
      }

      const checklist = await this.checklistHelper.closingChecklist(
        user,
        closingPeriodId,
        tx,
        false,
      );
      const approved = await this.applyTransitionWithAudit({
        period,
        action: 'APPROVE',
        actorId: actor.id,
        actorRole: toClosingActorRole(actor.role),
        checklistHasErrors: checklist.hasErrors,
        dbData: {
          hrApprovedAt: now,
          hrApprovedById: actor.id,
          closedAt: now,
          closedById: actor.id,
          lockedAt: period.lockedAt ?? now,
          lockSource: period.lockSource ?? ClosingLockSource.MANUAL_REVIEW_START,
        },
        auditAction: 'CLOSING_APPROVED',
        auditAfter: { hrApprovedAt: now.toISOString(), hrApprovedById: actor.id },
        tx,
      });
      await this.eventOutboxHelper.enqueueDomainEvent(
        {
          eventType: 'closing.completed',
          aggregateType: 'ClosingPeriod',
          aggregateId: approved.id,
          payload: {
            status: toCoreClosingStatus(approved.status),
            organizationUnitId: approved.organizationUnitId,
          },
        },
        tx,
      );
      return approved;
    });

    return toCoreClosingPeriod(updated);
  }
}
