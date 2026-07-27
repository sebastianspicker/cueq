/** Builds shared persistence predicates for detecting overlapping bookings. */
import type { Prisma } from '@cueq/database';

/** Matches open or completed bookings whose half-open interval intersects the candidate booking. */
export function bookingOverlapWhere(input: {
  personId: string;
  startTime: Date;
  endTime: Date | null;
}): Prisma.BookingWhereInput {
  if (input.endTime) {
    return {
      personId: input.personId,
      startTime: { lt: input.endTime },
      OR: [{ endTime: null }, { endTime: { gt: input.startTime } }],
    };
  }

  return {
    personId: input.personId,
    OR: [{ endTime: null }, { endTime: { gt: input.startTime } }],
  };
}
