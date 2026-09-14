import type { Prisma } from '@cueq/database';

export function toBookingDto(booking: Prisma.BookingGetPayload<{ include: { timeType: true } }>) {
  return {
    id: booking.id,
    personId: booking.personId,
    assignmentId: booking.assignmentId,
    timeTypeId: booking.timeTypeId,
    timeTypeCode: booking.timeType.code,
    timeTypeCategory: booking.timeType.category,
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime?.toISOString() ?? null,
    source: booking.source,
    note: booking.note,
    shiftId: booking.shiftId,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}
