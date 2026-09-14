/** Guards booking corrections against invalidating existing project effort allocations. */
import { ConflictException } from '@nestjs/common';
import { TimeTypeCategory, type Prisma } from '@cueq/database';

type AllocationGuardClient = Pick<
  Prisma.TransactionClient,
  'projectTimeAllocation' | 'booking' | 'timeType'
>;

export async function assertProjectAllocationsFit(
  tx: AllocationGuardClient,
  bookingId: string,
  proposedStart: Date,
  proposedEnd: Date | null,
  proposedTimeTypeId?: string,
) {
  const allocated = await tx.projectTimeAllocation.aggregate({
    where: { bookingId },
    _sum: { minutes: true },
  });
  const allocatedMinutes = allocated._sum.minutes ?? 0;
  if (allocatedMinutes === 0) return;

  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      startTime: true,
      endTime: true,
      timeTypeId: true,
      timeType: { select: { category: true } },
    },
  });
  if (!booking) {
    throw new ConflictException(
      'Booking correction would invalidate existing project time allocations.',
    );
  }
  const timestampsChanged =
    booking.startTime.getTime() !== proposedStart.getTime() ||
    booking.endTime?.getTime() !== proposedEnd?.getTime();
  if (timestampsChanged) {
    throw new ConflictException(
      'Reconcile project time allocations before changing an allocated booking interval.',
    );
  }
  const proposedTimeType =
    proposedTimeTypeId && proposedTimeTypeId !== booking.timeTypeId
      ? await tx.timeType.findUnique({
          where: { id: proposedTimeTypeId },
          select: { category: true },
        })
      : booking.timeType;
  const durationMinutes = proposedEnd
    ? Math.floor((proposedEnd.getTime() - proposedStart.getTime()) / 60_000)
    : -1;
  if (
    !proposedTimeType ||
    proposedTimeType.category === TimeTypeCategory.PAUSE ||
    proposedTimeType.category === TimeTypeCategory.ON_CALL ||
    allocatedMinutes > durationMinutes
  ) {
    throw new ConflictException(
      'Booking correction would invalidate existing project time allocations.',
    );
  }
}
