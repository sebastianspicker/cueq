import type { Prisma } from '@cueq/database';

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
