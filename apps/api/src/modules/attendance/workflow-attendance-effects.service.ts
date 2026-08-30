/** Owns booking and time-account mutations caused by approved workflows. */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';
import { BookingCorrectionSchema, OvertimeApprovalRequestSchema } from '@cueq/contracts';
import type {
  AttendanceWorkflowEffectsPort,
  WorkflowEffectInput,
  WorkflowPreApprovalInput,
} from '../../application/ports/workflow-side-effects.port.js';
import { bookingOverlapWhere } from '../../persistence/queries/booking-overlap.js';
import { AuditHelper } from '../audit/public.js';

@Injectable()
export class WorkflowAttendanceEffectsService implements AttendanceWorkflowEffectsPort {
  constructor(@Inject(AuditHelper) private readonly auditHelper: AuditHelper) {}

  async validateWorkflowPreApproval({ decision, tx }: WorkflowPreApprovalInput) {
    if (decision.type !== WorkflowType.OVERTIME_APPROVAL || decision.entityType !== 'TimeAccount') {
      return;
    }
    const request = OvertimeApprovalRequestSchema.parse(decision.requestPayload ?? {});
    const account = await tx.timeAccount.findFirst({
      where: {
        id: decision.entityId,
        personId: request.personId,
        periodStart: { lte: new Date(request.periodStart) },
        periodEnd: { gte: new Date(request.periodEnd) },
      },
      select: { id: true },
      orderBy: { periodStart: 'desc' },
    });
    if (!account)
      throw new BadRequestException('No matching time account found for overtime approval.');
  }

  async applyWorkflowEffect({ actorId, action, decision, reason, tx }: WorkflowEffectInput) {
    if (
      decision.type === WorkflowType.BOOKING_CORRECTION &&
      decision.entityType === 'Booking' &&
      action === 'APPROVE'
    ) {
      await this.applyBookingCorrection(actorId, decision, reason, tx);
    }
    if (
      decision.type === WorkflowType.OVERTIME_APPROVAL &&
      decision.entityType === 'TimeAccount' &&
      action === 'APPROVE'
    ) {
      await this.applyOvertimeApproval(actorId, decision, reason, tx);
    }
  }

  private async applyBookingCorrection(
    actorId: string,
    decision: WorkflowEffectInput['decision'],
    reason: string | undefined,
    tx: WorkflowEffectInput['tx'],
  ) {
    const correction = BookingCorrectionSchema.parse(decision.requestPayload ?? {});
    if (correction.bookingId !== decision.entityId) {
      throw new BadRequestException(
        'Booking correction payload does not match its workflow target.',
      );
    }
    const booking = await tx.booking.findUnique({
      where: { id: decision.entityId },
      select: { id: true, personId: true, timeTypeId: true, startTime: true, endTime: true },
    });
    if (!booking) throw new NotFoundException('Booking not found for approved correction.');

    const startTime = correction.startTime ? new Date(correction.startTime) : booking.startTime;
    const endTime = correction.endTime ? new Date(correction.endTime) : booking.endTime;
    if (endTime && startTime >= endTime) {
      throw new BadRequestException('Corrected booking endTime must be after startTime.');
    }
    const overlap = await tx.booking.findFirst({
      where: {
        AND: [
          bookingOverlapWhere({ personId: booking.personId, startTime, endTime }),
          { id: { not: booking.id } },
        ],
      },
      select: { id: true },
    });
    if (overlap)
      throw new BadRequestException('Corrected booking overlaps with an existing booking.');

    const updated = await tx.booking.update({
      where: { id: booking.id },
      data: { startTime, endTime, timeTypeId: correction.timeTypeId ?? booking.timeTypeId },
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
          workflowId: decision.id,
        },
        reason,
      },
      tx,
    );
  }

  private async applyOvertimeApproval(
    actorId: string,
    decision: WorkflowEffectInput['decision'],
    reason: string | undefined,
    tx: WorkflowEffectInput['tx'],
  ) {
    const request = OvertimeApprovalRequestSchema.parse(decision.requestPayload ?? {});
    const account = await tx.timeAccount.findFirst({
      where: {
        id: decision.entityId,
        personId: request.personId,
        periodStart: { lte: new Date(request.periodStart) },
        periodEnd: { gte: new Date(request.periodEnd) },
      },
      orderBy: { periodStart: 'desc' },
    });
    if (!account)
      throw new NotFoundException('No matching time account found for overtime approval.');

    const nextOvertimeHours =
      Number(Number(account.overtimeHours).toFixed(2)) + request.overtimeHours;
    const updated = await tx.timeAccount.update({
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
        after: { overtimeHours: Number(updated.overtimeHours), workflowId: decision.id },
        reason,
      },
      tx,
    );
  }
}
