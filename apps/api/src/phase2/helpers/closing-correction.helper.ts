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
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from './audit.helper';
import { toCoreClosingStatus } from './closing-lock.helper';
import { PersonHelper } from './person.helper';
import { HR_LIKE_ROLES } from './role-constants';
import { toClosingActorRole, toPersistenceClosingStatus } from './closing-utils';
import { WorkflowRuntimeService } from '../workflow-runtime.service';
import { bookingOverlapWhere } from './booking-overlap.helper';

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
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

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

    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.POST_CLOSE_CORRECTION,
      requesterId: actor.id,
      requesterOrganizationUnitId: actor.organizationUnitId,
    });

    const workflow = await this.prisma.workflowInstance.create({
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

    await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        hrApprovedAt: null,
        hrApprovedById: null,
        lockedAt: new Date(),
        lockSource: ClosingLockSource.HR_CORRECTION,
      },
    });

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'POST_CLOSE_CORRECTION_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
      },
      reason,
    });

    return workflow;
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
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }
    if (period.status !== ClosingStatus.REVIEW && period.status !== ClosingStatus.EXPORTED) {
      throw new BadRequestException(
        'Post-close booking corrections require a REVIEW or EXPORTED period.',
      );
    }

    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: parsed.workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Post-close correction workflow not found.');
    }
    if (
      workflow.type !== WorkflowType.POST_CLOSE_CORRECTION ||
      workflow.status !== WorkflowStatus.APPROVED ||
      workflow.entityType !== 'ClosingPeriod' ||
      workflow.entityId !== closingPeriodId
    ) {
      throw new BadRequestException(
        'workflowId must reference an APPROVED POST_CLOSE_CORRECTION workflow for this period.',
      );
    }

    const person = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: { id: true, organizationUnitId: true },
    });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }
    if (period.organizationUnitId && person.organizationUnitId !== period.organizationUnitId) {
      throw new BadRequestException(
        'Correction booking person must belong to the closing period organization unit.',
      );
    }

    const timeType = await this.prisma.timeType.findUnique({
      where: { id: parsed.timeTypeId },
      select: { id: true, code: true, category: true },
    });
    if (!timeType) {
      throw new NotFoundException('Time type not found.');
    }

    const startTime = new Date(parsed.startTime);
    const endTime = new Date(parsed.endTime);
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      startTime >= endTime
    ) {
      throw new BadRequestException('startTime and endTime must form a valid interval.');
    }
    if (startTime < period.periodStart || endTime > period.periodEnd) {
      throw new BadRequestException(
        'Correction booking interval must be inside the closing period time range.',
      );
    }

    const overlap = await this.prisma.booking.findFirst({
      where: bookingOverlapWhere({
        personId: parsed.personId,
        startTime,
        endTime,
      }),
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException('Correction booking overlaps with an existing booking.');
    }

    const booking = await this.prisma.booking.create({
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
    const isWorkCategory =
      timeType.category === TimeTypeCategory.WORK ||
      timeType.category === TimeTypeCategory.DEPLOYMENT;
    if (isWorkCategory) {
      await this.prisma.timeAccount.updateMany({
        where: {
          personId: parsed.personId,
          periodStart: { gte: period.periodStart },
          periodEnd: { lte: period.periodEnd },
        },
        data: {
          actualHours: { increment: durationHours },
          balance: { increment: durationHours },
        },
      });
    }

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'POST_CLOSE_CORRECTION_APPLIED',
      entityType: 'Booking',
      entityId: booking.id,
      after: {
        closingPeriodId,
        workflowId: workflow.id,
        personId: booking.personId,
        timeTypeId: booking.timeTypeId,
        timeTypeCode: timeType.code,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime?.toISOString() ?? null,
        durationHours,
      },
      reason: parsed.reason,
    });

    return {
      id: booking.id,
      closingPeriodId,
      workflowId: workflow.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: timeType.code,
      timeTypeCategory: timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? null,
      source: booking.source,
      note: booking.note,
      durationHours,
    };
  }
}
