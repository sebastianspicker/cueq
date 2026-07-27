/** Revalidates and applies domain effects when workflow decisions become final. */
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AbsenceStatus, WorkflowType } from '@cueq/database';
import {
  BookingCorrectionSchema,
  ShiftSwapRequestSchema,
  OvertimeApprovalRequestSchema,
} from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from './audit.helper.js';
import { bookingOverlapWhere } from './booking-overlap.helper.js';
import type { WorkflowDecisionResult } from './workflow-utils.js';

/**
 * Revalidates and applies workflow-specific effects at decision time.
 * Approval side effects remain transaction-bound so stale requests cannot silently violate current constraints.
 */
@Injectable()
export class WorkflowSideEffectsHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async validatePreApproval(
    workflowId: string,
    tx?: Pick<PrismaService, 'workflowInstance' | 'shift' | 'person' | 'timeAccount'>,
  ) {
    const db = tx ?? this.prisma;
    const workflow = await db.workflowInstance.findUnique({
      where: { id: workflowId },
      select: { id: true, type: true, entityType: true, entityId: true, requestPayload: true },
    });
    if (!workflow) {
      throw new NotFoundException('Workflow not found.');
    }

    if (workflow.type === WorkflowType.SHIFT_SWAP && workflow.entityType === 'Shift') {
      await this.validateShiftSwapApproval(db, workflow.entityId, workflow.requestPayload);
    }
    if (workflow.type === WorkflowType.OVERTIME_APPROVAL && workflow.entityType === 'TimeAccount') {
      await this.validateOvertimeApproval(db, workflow.entityId, workflow.requestPayload);
    }
  }

  private async validateShiftSwapApproval(
    db: Pick<PrismaService, 'shift' | 'person'>,
    entityId: string,
    requestPayload: unknown,
  ) {
    const request = ShiftSwapRequestSchema.parse(requestPayload ?? {});
    const shift = await db.shift.findUnique({
      where: { id: request.shiftId || entityId },
      include: {
        assignments: true,
        roster: { select: { organizationUnitId: true } },
      },
    });
    if (!shift) throw new NotFoundException('Shift not found for approved swap.');
    const toPerson = await db.person.findUnique({
      where: { id: request.toPersonId },
      select: { id: true, organizationUnitId: true },
    });
    if (!toPerson) throw new NotFoundException('toPersonId person no longer exists.');
    if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException(
        'toPersonId must belong to the shift roster organization unit.',
      );
    }
    if (!shift.assignments.some((assignment) => assignment.personId === request.fromPersonId)) {
      throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
    }
    if (shift.assignments.some((assignment) => assignment.personId === request.toPersonId)) {
      throw new BadRequestException('toPersonId assignment already exists on shift.');
    }
  }

  private async validateOvertimeApproval(
    db: Pick<PrismaService, 'timeAccount'>,
    entityId: string,
    requestPayload: unknown,
  ) {
    const request = OvertimeApprovalRequestSchema.parse(requestPayload ?? {});
    const account = await db.timeAccount.findFirst({
      where: {
        id: entityId,
        personId: request.personId,
        periodStart: { lte: new Date(request.periodStart) },
        periodEnd: { gte: new Date(request.periodEnd) },
      },
      select: { id: true },
      orderBy: { periodStart: 'desc' },
    });
    if (!account) {
      throw new BadRequestException('No matching time account found for overtime approval.');
    }
  }

  async validatePostCloseSelfApproval(
    actorId: string,
    workflow: { requesterId: string; type: string },
    _reason?: string,
  ) {
    if (workflow.type !== WorkflowType.POST_CLOSE_CORRECTION) return;
    if (workflow.requesterId !== actorId) return;

    throw new ForbiddenException('Post-close corrections cannot be self-approved.');
  }

  async applyDecisionSideEffects(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<
      PrismaService,
      'absence' | 'booking' | 'shift' | 'shiftAssignment' | 'person' | 'timeAccount' | 'auditEntry'
    >,
  ) {
    await this.applyLeaveRequestEffect(actorId, decision, reason, tx);
    await this.applyBookingCorrectionEffect(actorId, decision, reason, tx);
    await this.applyShiftSwapEffect(actorId, decision, reason, tx);
    await this.applyOvertimeEffect(actorId, decision, reason, tx);
  }

  private async applyBookingCorrectionEffect(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<PrismaService, 'booking' | 'auditEntry'>,
  ) {
    const db = tx ?? this.prisma;
    if (!this.isApprovedBookingCorrection(decision)) return;

    const correction = BookingCorrectionSchema.parse(decision.updated.requestPayload ?? {});
    if (correction.bookingId !== decision.updated.entityId) {
      throw new BadRequestException(
        'Booking correction payload does not match its workflow target.',
      );
    }

    const booking = await db.booking.findUnique({
      where: { id: decision.updated.entityId },
      select: { id: true, personId: true, timeTypeId: true, startTime: true, endTime: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for approved correction.');
    }

    const { startTime, endTime } = this.resolveCorrectionInterval(booking, correction);
    await this.assertNoCorrectionOverlap(db, booking.id, booking.personId, startTime, endTime);

    const updated = await db.booking.update({
      where: { id: booking.id },
      data: {
        startTime,
        endTime,
        timeTypeId: correction.timeTypeId ?? booking.timeTypeId,
      },
    });
    await this.auditHelper.appendAudit(
      {
        actorId,
        action: 'BOOKING_UPDATED',
        entityType: 'Booking',
        entityId: updated.id,
        before: {
          timeTypeId: booking.timeTypeId,
          startTime: booking.startTime.toISOString(),
          endTime: booking.endTime?.toISOString() ?? null,
        },
        after: {
          timeTypeId: updated.timeTypeId,
          startTime: updated.startTime.toISOString(),
          endTime: updated.endTime?.toISOString() ?? null,
          workflowId: decision.updated.id,
        },
        reason,
      },
      db,
    );
  }

  private isApprovedBookingCorrection(decision: WorkflowDecisionResult) {
    return (
      decision.updated.type === WorkflowType.BOOKING_CORRECTION &&
      decision.updated.entityType === 'Booking' &&
      decision.action === 'APPROVE'
    );
  }

  private resolveCorrectionInterval(
    booking: { startTime: Date; endTime: Date | null },
    correction: { startTime?: string; endTime?: string },
  ) {
    const startTime = correction.startTime ? new Date(correction.startTime) : booking.startTime;
    const endTime = correction.endTime ? new Date(correction.endTime) : booking.endTime;
    if (endTime && startTime >= endTime) {
      throw new BadRequestException('Corrected booking endTime must be after startTime.');
    }
    return { startTime, endTime };
  }

  private async assertNoCorrectionOverlap(
    db: Pick<PrismaService, 'booking'>,
    bookingId: string,
    personId: string,
    startTime: Date,
    endTime: Date | null,
  ) {
    const overlap = await db.booking.findFirst({
      where: {
        AND: [bookingOverlapWhere({ personId, startTime, endTime }), { id: { not: bookingId } }],
      },
      select: { id: true },
    });
    if (overlap)
      throw new BadRequestException('Corrected booking overlaps with an existing booking.');
  }

  private async applyLeaveRequestEffect(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<PrismaService, 'absence' | 'auditEntry'>,
  ) {
    const db = tx ?? this.prisma;
    if (
      decision.updated.type !== WorkflowType.LEAVE_REQUEST ||
      decision.updated.entityType !== 'Absence'
    ) {
      return;
    }

    const nextAbsenceStatus =
      decision.action === 'APPROVE'
        ? AbsenceStatus.APPROVED
        : decision.action === 'REJECT'
          ? AbsenceStatus.REJECTED
          : decision.action === 'CANCEL'
            ? AbsenceStatus.CANCELLED
            : null;

    if (!nextAbsenceStatus) {
      return;
    }

    const currentAbsence = await db.absence.findUnique({
      where: { id: decision.updated.entityId },
      select: { status: true },
    });
    const result = await db.absence.updateMany({
      where: {
        id: decision.updated.entityId,
        status:
          nextAbsenceStatus === AbsenceStatus.CANCELLED
            ? { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] }
            : AbsenceStatus.REQUESTED,
      },
      data: { status: nextAbsenceStatus },
    });

    if (result.count > 0) {
      await this.auditHelper.appendAudit(
        {
          actorId,
          action:
            nextAbsenceStatus === AbsenceStatus.APPROVED
              ? 'ABSENCE_APPROVED'
              : nextAbsenceStatus === AbsenceStatus.REJECTED
                ? 'ABSENCE_REJECTED'
                : 'ABSENCE_CANCELLED',
          entityType: 'Absence',
          entityId: decision.updated.entityId,
          before: { status: currentAbsence?.status ?? null },
          after: { status: nextAbsenceStatus },
          reason,
        },
        db,
      );
    }
  }

  private async applyShiftSwapEffect(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<PrismaService, 'shift' | 'shiftAssignment' | 'person' | 'auditEntry'>,
  ) {
    if (
      decision.updated.type !== WorkflowType.SHIFT_SWAP ||
      decision.updated.entityType !== 'Shift' ||
      decision.action !== 'APPROVE'
    ) {
      return;
    }

    const swapPayload = ShiftSwapRequestSchema.parse(decision.updated.requestPayload ?? {});
    const shiftId = swapPayload.shiftId || decision.updated.entityId;
    const runSwap = async (
      db: Pick<PrismaService, 'shift' | 'shiftAssignment' | 'person' | 'auditEntry'>,
    ) => {
      const shift = await db.shift.findUnique({
        where: { id: shiftId },
        include: {
          assignments: true,
          roster: { select: { organizationUnitId: true } },
        },
      });
      if (!shift) {
        throw new NotFoundException('Shift not found for approved swap.');
      }
      const toPerson = await db.person.findUnique({
        where: { id: swapPayload.toPersonId },
        select: { id: true, organizationUnitId: true },
      });
      if (!toPerson) {
        throw new NotFoundException('toPersonId person no longer exists.');
      }
      if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
        throw new BadRequestException(
          'toPersonId must belong to the shift roster organization unit.',
        );
      }
      const fromAssignment = shift.assignments.find((a) => a.personId === swapPayload.fromPersonId);
      if (!fromAssignment) {
        throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
      }
      if (shift.assignments.some((a) => a.personId === swapPayload.toPersonId)) {
        throw new BadRequestException('toPersonId assignment already exists on shift.');
      }
      const overlappingAssignment = await db.shiftAssignment.findFirst({
        where: {
          personId: swapPayload.toPersonId,
          shift: {
            id: { not: shift.id },
            startTime: { lt: shift.endTime },
            endTime: { gt: shift.startTime },
          },
        },
        select: { id: true },
      });
      if (overlappingAssignment) {
        throw new BadRequestException('toPersonId has an overlapping assigned shift.');
      }
      await db.shiftAssignment.delete({ where: { id: fromAssignment.id } });
      await db.shiftAssignment.create({
        data: { shiftId: shift.id, personId: swapPayload.toPersonId },
      });
      if (shift.personId === swapPayload.fromPersonId) {
        await db.shift.update({
          where: { id: shift.id },
          data: { personId: swapPayload.toPersonId },
        });
      }
    };

    const applySwapAndAudit = async (
      db: Pick<PrismaService, 'shift' | 'shiftAssignment' | 'person' | 'auditEntry'>,
    ) => {
      await runSwap(db);
      await this.auditHelper.appendAudit(
        {
          actorId,
          action: 'SHIFT_SWAP_APPLIED',
          entityType: 'Shift',
          entityId: decision.updated.entityId,
          after: {
            fromPersonId: swapPayload.fromPersonId,
            toPersonId: swapPayload.toPersonId,
            workflowId: decision.updated.id,
          },
          reason,
        },
        db,
      );
    };

    if (tx) {
      await applySwapAndAudit(tx);
    } else {
      await this.prisma.$transaction(async (innerTx) => applySwapAndAudit(innerTx));
    }
  }

  private async applyOvertimeEffect(
    actorId: string,
    decision: WorkflowDecisionResult,
    reason?: string,
    tx?: Pick<PrismaService, 'timeAccount' | 'auditEntry'>,
  ) {
    const db = tx ?? this.prisma;
    if (
      decision.updated.type !== WorkflowType.OVERTIME_APPROVAL ||
      decision.updated.entityType !== 'TimeAccount' ||
      decision.action !== 'APPROVE'
    ) {
      return;
    }

    const otPayload = OvertimeApprovalRequestSchema.parse(decision.updated.requestPayload ?? {});
    const periodStart = new Date(otPayload.periodStart);
    const periodEnd = new Date(otPayload.periodEnd);

    const account = await db.timeAccount.findFirst({
      where: {
        id: decision.updated.entityId,
        personId: otPayload.personId,
        periodStart: { lte: periodStart },
        periodEnd: { gte: periodEnd },
      },
      orderBy: { periodStart: 'desc' },
    });
    if (!account) {
      throw new NotFoundException('No matching time account found for overtime approval.');
    }

    const nextOvertimeHours =
      Number(Number(account.overtimeHours).toFixed(2)) + otPayload.overtimeHours;
    const updated = await db.timeAccount.update({
      where: { id: account.id },
      data: { overtimeHours: Number(nextOvertimeHours.toFixed(2)) },
    });

    await this.auditHelper.appendAudit(
      {
        actorId,
        action: 'OVERTIME_APPROVED',
        entityType: 'TimeAccount',
        entityId: updated.id,
        before: { overtimeHours: Number(account.overtimeHours) },
        after: {
          overtimeHours: Number(updated.overtimeHours),
          workflowId: decision.updated.id,
        },
        reason,
      },
      db,
    );
  }
}
