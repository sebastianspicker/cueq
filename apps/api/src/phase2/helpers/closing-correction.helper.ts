/** Creates controlled, auditable corrections against closing-period records. */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingSource,
  ClosingLockSource,
  ClosingStatus,
  TimeTypeCategory,
  WorkflowStatus,
  WorkflowType,
} from '@cueq/database';
import { applyCutoffLock } from '@cueq/core';
import { ClosingBookingCorrectionSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { Prisma } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { AuditHelper } from './audit.helper.js';
import { toCoreClosingStatus } from './closing-lock.helper.js';
import { PersonHelper } from './person.helper.js';
import { HR_LIKE_ROLES } from './role-constants.js';
import { toClosingActorRole, toPersistenceClosingStatus } from './closing-utils.js';
import { WorkflowRuntimeService } from '../workflow-runtime.service.js';
import { bookingOverlapWhere } from './booking-overlap.helper.js';
import { lockClosingPeriodWrites, lockPersonWrites } from './transaction-lock.helper.js';

/**
 * Creates controlled corrections for closed-period data without reopening the original operational record.
 * Each correction is lock-checked and audit-linked to preserve payroll traceability.
 */
@Injectable()
export class ClosingCorrectionHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(WorkflowRuntimeService)
    private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  async postCloseCorrection(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    reason?: string,
  ): Promise<unknown> {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can create post-close corrections.');
    }

    const actor = await this.personHelper.personForUser(user);
    return this.prisma.$transaction(async (tx) => {
      await lockClosingPeriodWrites(tx, closingPeriodId);

      const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
      if (!period) {
        throw new NotFoundException('Closing period not found.');
      }

      const transition = applyCutoffLock({
        currentStatus: toCoreClosingStatus(period.status),
        action: 'POST_CLOSE_CORRECTION',
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

      const assignment = await this.workflowRuntimeService.buildWorkflowAssignment(
        {
          type: WorkflowType.POST_CLOSE_CORRECTION,
          requesterId: actor.id,
          requesterOrganizationUnitId: actor.organizationUnitId,
        },
        tx,
      );

      const workflow = await tx.workflowInstance.create({
        data: {
          type: WorkflowType.POST_CLOSE_CORRECTION,
          status: assignment.status,
          requesterId: actor.id,
          approverId: assignment.approverId,
          entityType: 'ClosingPeriod',
          entityId: period.id,
          reason,
          requestPayload: {
            closingPeriodId,
          },
          submittedAt: assignment.submittedAt,
          dueAt: assignment.dueAt,
          escalationLevel: assignment.escalationLevel,
          delegationTrail: assignment.delegationTrail,
        },
      });

      await tx.closingPeriod.update({
        where: { id: period.id },
        data: {
          status: toPersistenceClosingStatus(transition.nextStatus),
          hrApprovedAt: null,
          hrApprovedById: null,
          lockedAt: new Date(),
          lockSource: ClosingLockSource.HR_CORRECTION,
        },
      });

      await this.auditHelper.appendAudit(
        {
          actorId: actor.id,
          action: 'POST_CLOSE_CORRECTION_CREATED',
          entityType: 'WorkflowInstance',
          entityId: workflow.id,
          after: {
            approverId: workflow.approverId,
            dueAt: workflow.dueAt?.toISOString() ?? null,
          },
          reason,
        },
        tx,
      );

      return workflow;
    });
  }

  async applyPostCloseBookingCorrection(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    payload: unknown,
  ) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can apply post-close booking corrections.');
    }

    const actor = await this.personHelper.personForUser(user);
    const parsed = ClosingBookingCorrectionSchema.parse(payload ?? {});
    const startTime = new Date(parsed.startTime);
    const endTime = new Date(parsed.endTime);
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      startTime >= endTime
    ) {
      throw new BadRequestException('startTime and endTime must form a valid interval.');
    }
    return this.prisma.$transaction((tx) =>
      this.applyPostCloseBookingCorrectionInTransaction(
        tx,
        actor.id,
        closingPeriodId,
        parsed,
        startTime,
        endTime,
      ),
    );
  }

  private async applyPostCloseBookingCorrectionInTransaction(
    tx: Prisma.TransactionClient,
    actorId: string,
    closingPeriodId: string,
    parsed: ReturnType<typeof ClosingBookingCorrectionSchema.parse>,
    startTime: Date,
    endTime: Date,
  ) {
    await lockClosingPeriodWrites(tx, closingPeriodId);
    await lockPersonWrites(tx, [parsed.personId]);
    const { period, workflow, timeType } = await this.validateCorrectionRequest(
      tx,
      closingPeriodId,
      parsed,
      startTime,
      endTime,
    );
    await this.assertNoCorrectionOverlap(tx, parsed.personId, startTime, endTime);
    const booking = await tx.booking.create({
      data: {
        personId: parsed.personId,
        timeTypeId: parsed.timeTypeId,
        startTime,
        endTime,
        source: BookingSource.CORRECTION,
        note: parsed.note ?? parsed.reason,
      },
    });
    const durationHours = Number(
      ((endTime.getTime() - startTime.getTime()) / 3_600_000).toFixed(4),
    );
    await this.updateTimeAccountForCorrection(
      tx,
      parsed.personId,
      period,
      timeType.category,
      durationHours,
    );
    await this.appendCorrectionAudit(
      tx,
      actorId,
      closingPeriodId,
      workflow.id,
      booking,
      timeType.code,
      durationHours,
      parsed.reason,
    );
    return {
      id: booking.id,
      closingPeriodId,
      workflowId: workflow.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: timeType.code,
      timeTypeCategory: timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? endTime.toISOString(),
      source: booking.source,
      note: booking.note,
      durationHours,
    };
  }

  private async validateCorrectionRequest(
    tx: Prisma.TransactionClient,
    closingPeriodId: string,
    parsed: ReturnType<typeof ClosingBookingCorrectionSchema.parse>,
    startTime: Date,
    endTime: Date,
  ) {
    const period = await tx.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) throw new NotFoundException('Closing period not found.');
    if (period.status !== ClosingStatus.REVIEW && period.status !== ClosingStatus.EXPORTED) {
      throw new BadRequestException(
        'Post-close booking corrections require a REVIEW or EXPORTED period.',
      );
    }
    if (startTime < period.periodStart || endTime > period.periodEnd) {
      throw new BadRequestException(
        'Correction booking interval must be inside the closing period time range.',
      );
    }
    const [workflow, person, timeType] = await Promise.all([
      tx.workflowInstance.findUnique({ where: { id: parsed.workflowId } }),
      tx.person.findUnique({
        where: { id: parsed.personId },
        select: { organizationUnitId: true },
      }),
      tx.timeType.findUnique({
        where: { id: parsed.timeTypeId },
        select: { code: true, category: true },
      }),
    ]);
    if (!workflow) throw new NotFoundException('Post-close correction workflow not found.');
    if (!this.isApprovedCorrectionWorkflow(workflow, closingPeriodId)) {
      throw new BadRequestException(
        'workflowId must reference an APPROVED POST_CLOSE_CORRECTION workflow for this period.',
      );
    }
    if (!person) throw new NotFoundException('Person not found.');
    if (period.organizationUnitId && person.organizationUnitId !== period.organizationUnitId) {
      throw new BadRequestException(
        'Correction booking person must belong to the closing period organization unit.',
      );
    }
    if (!timeType) throw new NotFoundException('Time type not found.');
    return { period, workflow, timeType };
  }

  private isApprovedCorrectionWorkflow(
    workflow: { type: WorkflowType; status: WorkflowStatus; entityType: string; entityId: string },
    closingPeriodId: string,
  ) {
    return (
      workflow.type === WorkflowType.POST_CLOSE_CORRECTION &&
      workflow.status === WorkflowStatus.APPROVED &&
      workflow.entityType === 'ClosingPeriod' &&
      workflow.entityId === closingPeriodId
    );
  }

  private async assertNoCorrectionOverlap(
    tx: Prisma.TransactionClient,
    personId: string,
    startTime: Date,
    endTime: Date,
  ) {
    const overlap = await tx.booking.findFirst({
      where: bookingOverlapWhere({ personId, startTime, endTime }),
      select: { id: true },
    });
    if (overlap)
      throw new BadRequestException('Correction booking overlaps with an existing booking.');
  }

  private async updateTimeAccountForCorrection(
    tx: Prisma.TransactionClient,
    personId: string,
    period: { periodStart: Date; periodEnd: Date },
    category: TimeTypeCategory,
    durationHours: number,
  ) {
    if (category !== TimeTypeCategory.WORK && category !== TimeTypeCategory.DEPLOYMENT) {
      return;
    }
    await tx.timeAccount.updateMany({
      where: {
        personId,
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
      },
      data: { actualHours: { increment: durationHours }, balance: { increment: durationHours } },
    });
  }

  private async appendCorrectionAudit(
    tx: Prisma.TransactionClient,
    actorId: string,
    closingPeriodId: string,
    workflowId: string,
    booking: {
      id: string;
      personId: string;
      timeTypeId: string;
      startTime: Date;
      endTime: Date | null;
    },
    timeTypeCode: string,
    durationHours: number,
    reason: string,
  ) {
    await this.auditHelper.appendAudit(
      {
        actorId,
        action: 'POST_CLOSE_CORRECTION_APPLIED',
        entityType: 'Booking',
        entityId: booking.id,
        after: {
          closingPeriodId,
          workflowId,
          personId: booking.personId,
          timeTypeId: booking.timeTypeId,
          timeTypeCode,
          startTime: booking.startTime.toISOString(),
          endTime: booking.endTime?.toISOString() ?? null,
          durationHours,
        },
        reason,
      },
      tx,
    );
  }
}
