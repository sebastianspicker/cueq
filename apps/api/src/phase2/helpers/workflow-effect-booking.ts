import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';
import { BookingCorrectionSchema } from '@cueq/shared';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from './audit.helper.js';
import { bookingOverlapWhere } from './booking-overlap.helper.js';
import type { WorkflowDecisionResult } from './workflow-utils.js';

export async function applyBookingCorrectionEffect(
  actorId: string,
  decision: WorkflowDecisionResult,
  reason: string | undefined,
  db: Pick<PrismaService, 'booking' | 'auditEntry'>,
  auditHelper: Pick<AuditHelper, 'appendAudit'>,
) {
  if (
    decision.updated.type !== WorkflowType.BOOKING_CORRECTION ||
    decision.updated.entityType !== 'Booking' ||
    decision.action !== 'APPROVE'
  ) {
    return;
  }

  const correction = BookingCorrectionSchema.parse(decision.updated.requestPayload ?? {});
  if (correction.bookingId !== decision.updated.entityId) {
    throw new BadRequestException('Booking correction payload does not match its workflow target.');
  }
  const booking = await db.booking.findUnique({
    where: { id: decision.updated.entityId },
    select: { id: true, personId: true, timeTypeId: true, startTime: true, endTime: true },
  });
  if (!booking) throw new NotFoundException('Booking not found for approved correction.');

  const { startTime, endTime } = resolveCorrectionInterval(booking, correction);
  await assertNoCorrectionOverlap(db, booking.id, booking.personId, startTime, endTime);
  const updated = await db.booking.update({
    where: { id: booking.id },
    data: { startTime, endTime, timeTypeId: correction.timeTypeId ?? booking.timeTypeId },
  });
  await auditHelper.appendAudit(
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

function resolveCorrectionInterval(
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

async function assertNoCorrectionOverlap(
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
