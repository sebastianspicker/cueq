import { WORK_INTERVAL_TYPES } from '../constants.js';
import { roundToTwo } from '../numerical/precision.js';

export interface PlanVsActualSlot {
  slotId: string;
  plannedHeadcount: number;
  actualHeadcount: number;
}

export interface PlanVsActualResult {
  totalSlots: number;
  mismatchedSlots: number;
  complianceRate: number;
}

/** Summarize exact headcount mismatches without treating an empty plan as a failure. */
export function comparePlanVsActual(slots: PlanVsActualSlot[]): PlanVsActualResult {
  if (slots.length === 0) {
    return {
      totalSlots: 0,
      mismatchedSlots: 0,
      complianceRate: 1,
    };
  }

  const mismatchedSlots = slots.filter(
    (slot) => slot.plannedHeadcount !== slot.actualHeadcount,
  ).length;

  return {
    totalSlots: slots.length,
    mismatchedSlots,
    complianceRate: roundToTwo((slots.length - mismatchedSlots) / slots.length),
  };
}

export interface PlanVsActualCoverageSlot {
  shiftId: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  minStaffing: number;
  assignedPersonIds: string[];
}

export interface PlanVsActualBooking {
  personId: string;
  startTime: string;
  endTime: string;
  timeTypeCategory: string;
}

export interface PlanVsActualCoverageSlotResult {
  shiftId: string;
  startTime: string;
  endTime: string;
  shiftType: string;
  minStaffing: number;
  assignedHeadcount: number;
  plannedHeadcount: number;
  actualHeadcount: number;
  delta: number;
  compliant: boolean;
  plannedDurationMinutes: number;
  actualCoveredMinutes: number;
  durationCoverageRatio: number;
}

export interface PlanVsActualCoverageResult extends PlanVsActualResult {
  understaffedSlots: number;
  coverageRate: number;
  durationCoverageRate: number;
  slots: PlanVsActualCoverageSlotResult[];
}

type MinuteRange = { start: number; end: number };

type ParsedCoverageSlot = PlanVsActualCoverageSlot & {
  startMs: number;
  endMs: number;
};

type ParsedBooking = {
  personId: string;
  startMs: number;
  endMs: number;
  inputIndex: number;
};

type BookingIntervalIndex = {
  eligibleBookings: ParsedBooking[];
  indexedBookings: ParsedBooking[];
  prefixMaximumEnd: number[];
  nonIndexableBookings: ParsedBooking[];
};

function overlapRange(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): MinuteRange | null {
  if (aStart >= bEnd || bStart >= aEnd) {
    return null;
  }

  return {
    start: Math.max(aStart, bStart),
    end: Math.min(aEnd, bEnd),
  };
}

function parseCoverageSlot(slot: PlanVsActualCoverageSlot): ParsedCoverageSlot {
  return {
    ...slot,
    startMs: new Date(slot.startTime).getTime(),
    endMs: new Date(slot.endTime).getTime(),
  };
}

function buildBookingIntervalIndex(
  bookings: PlanVsActualBooking[],
  allowedCategories: ReadonlySet<string>,
): BookingIntervalIndex {
  const eligibleBookings: ParsedBooking[] = [];
  const indexedBookings: ParsedBooking[] = [];
  const nonIndexableBookings: ParsedBooking[] = [];

  bookings.forEach((booking, inputIndex) => {
    if (!allowedCategories.has(booking.timeTypeCategory)) {
      return;
    }

    const parsedBooking = {
      personId: booking.personId,
      startMs: new Date(booking.startTime).getTime(),
      endMs: new Date(booking.endTime).getTime(),
      inputIndex,
    };
    eligibleBookings.push(parsedBooking);

    if (
      Number.isFinite(parsedBooking.startMs) &&
      Number.isFinite(parsedBooking.endMs) &&
      parsedBooking.startMs < parsedBooking.endMs
    ) {
      indexedBookings.push(parsedBooking);
    } else {
      nonIndexableBookings.push(parsedBooking);
    }
  });

  indexedBookings.sort(
    (left, right) => left.startMs - right.startMs || left.inputIndex - right.inputIndex,
  );

  const prefixMaximumEnd: number[] = [];
  let maximumEnd = Number.NEGATIVE_INFINITY;
  for (const booking of indexedBookings) {
    maximumEnd = Math.max(maximumEnd, booking.endMs);
    prefixMaximumEnd.push(maximumEnd);
  }

  return { eligibleBookings, indexedBookings, prefixMaximumEnd, nonIndexableBookings };
}

function firstBookingStartingAtOrAfter(bookings: ParsedBooking[], instant: number): number {
  let low = 0;
  let high = bookings.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const booking = bookings[middle];
    if (booking && booking.startMs < instant) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function overlapsSlot(slot: ParsedCoverageSlot, booking: ParsedBooking): boolean {
  return !(slot.startMs >= booking.endMs || booking.startMs >= slot.endMs);
}

function queryBookingIntervalIndex(
  slot: ParsedCoverageSlot,
  index: BookingIntervalIndex,
): ParsedBooking[] {
  if (
    !Number.isFinite(slot.startMs) ||
    !Number.isFinite(slot.endMs) ||
    slot.startMs >= slot.endMs
  ) {
    return index.eligibleBookings.filter((booking) => overlapsSlot(slot, booking));
  }

  const matches: ParsedBooking[] = [];
  let bookingIndex = firstBookingStartingAtOrAfter(index.indexedBookings, slot.endMs) - 1;

  while (bookingIndex >= 0) {
    const maximumEnd = index.prefixMaximumEnd[bookingIndex];
    if (maximumEnd === undefined || maximumEnd <= slot.startMs) {
      break;
    }

    const booking = index.indexedBookings[bookingIndex];
    if (booking && booking.endMs > slot.startMs) {
      matches.push(booking);
    }
    bookingIndex -= 1;
  }

  for (const booking of index.nonIndexableBookings) {
    if (overlapsSlot(slot, booking)) {
      matches.push(booking);
    }
  }

  matches.sort((left, right) => left.inputIndex - right.inputIndex);
  return matches;
}

function mergeMinuteRanges(ranges: MinuteRange[]): number {
  if (ranges.length === 0) {
    return 0;
  }

  const sortedRanges = [...ranges].sort((left, right) => left.start - right.start);
  let total = 0;
  let current = sortedRanges[0];

  for (let index = 1; index < sortedRanges.length; index += 1) {
    const next = sortedRanges[index];
    if (!current || !next) {
      continue;
    }

    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end);
      continue;
    }

    total += current.end - current.start;
    current = { ...next };
  }

  if (!current) {
    return total;
  }

  total += current.end - current.start;
  return total / 60_000;
}

function slotDurationMinutes(slot: ParsedCoverageSlot): number {
  return (slot.endMs - slot.startMs) / 60_000;
}

function plannedHeadcount(slot: PlanVsActualCoverageSlot): {
  assignedHeadcount: number;
  plannedHeadcount: number;
} {
  const assignedHeadcount = new Set(slot.assignedPersonIds).size;
  // Minimum staffing is the legal/operational floor; explicit assignments can
  // raise the planned headcount for a concrete shift.
  return {
    assignedHeadcount,
    plannedHeadcount: Math.max(slot.minStaffing, assignedHeadcount),
  };
}

function collectBookingRangesByPerson(
  slot: ParsedCoverageSlot,
  bookingIndex: BookingIntervalIndex,
): Map<string, MinuteRange[]> {
  const bookingRangesByPerson = new Map<string, MinuteRange[]>();

  for (const booking of queryBookingIntervalIndex(slot, bookingIndex)) {
    const coveredRange = overlapRange(slot.startMs, slot.endMs, booking.startMs, booking.endMs);
    if (!coveredRange) {
      continue;
    }

    const ranges = bookingRangesByPerson.get(booking.personId) ?? [];
    ranges.push({
      start: coveredRange.start - slot.startMs,
      end: coveredRange.end - slot.startMs,
    });
    bookingRangesByPerson.set(booking.personId, ranges);
  }

  return bookingRangesByPerson;
}

function summarizeCoveredPersons(
  bookingRangesByPerson: Map<string, MinuteRange[]>,
  minimumCoverageMinutes: number,
): { actualHeadcount: number; totalCoveredMinutes: number } {
  let actualHeadcount = 0;
  let totalCoveredMinutes = 0;

  for (const ranges of bookingRangesByPerson.values()) {
    const personCoveredMinutes = mergeMinuteRanges(ranges);
    if (personCoveredMinutes >= minimumCoverageMinutes) {
      actualHeadcount += 1;
      totalCoveredMinutes += personCoveredMinutes;
    }
  }

  return { actualHeadcount, totalCoveredMinutes };
}

function evaluateCoverageSlot(
  slot: ParsedCoverageSlot,
  bookingIndex: BookingIntervalIndex,
  coverageThreshold: number,
): PlanVsActualCoverageSlotResult {
  const { assignedHeadcount, plannedHeadcount: plannedSlotHeadcount } = plannedHeadcount(slot);
  const durationMinutes = slotDurationMinutes(slot);
  const minimumCoverageMinutes = durationMinutes * coverageThreshold;
  const bookingRangesByPerson = collectBookingRangesByPerson(slot, bookingIndex);
  const { actualHeadcount, totalCoveredMinutes } = summarizeCoveredPersons(
    bookingRangesByPerson,
    minimumCoverageMinutes,
  );
  const durationCoverageRatio =
    durationMinutes > 0 && actualHeadcount > 0
      ? roundToTwo(totalCoveredMinutes / (durationMinutes * plannedSlotHeadcount))
      : 0;

  return {
    shiftId: slot.shiftId,
    startTime: slot.startTime,
    endTime: slot.endTime,
    shiftType: slot.shiftType,
    minStaffing: slot.minStaffing,
    assignedHeadcount,
    plannedHeadcount: plannedSlotHeadcount,
    actualHeadcount,
    delta: actualHeadcount - plannedSlotHeadcount,
    compliant: actualHeadcount >= plannedSlotHeadcount,
    plannedDurationMinutes: durationMinutes,
    actualCoveredMinutes: roundToTwo(totalCoveredMinutes),
    durationCoverageRatio,
  };
}

function countUnderstaffedSlots(slotResults: PlanVsActualCoverageSlotResult[]): number {
  return slotResults.filter((slot) => slot.actualHeadcount < slot.minStaffing).length;
}

function totalPlannedCoverageMinutes(slotResults: PlanVsActualCoverageSlotResult[]): number {
  return slotResults.reduce(
    (sum, slot) => sum + slot.plannedDurationMinutes * slot.plannedHeadcount,
    0,
  );
}

function totalActualCoverageMinutes(slotResults: PlanVsActualCoverageSlotResult[]): number {
  return slotResults.reduce((sum, slot) => sum + slot.actualCoveredMinutes, 0);
}

/** Compare planned staffing with actual work coverage using a configurable duration threshold. */
export function evaluatePlanVsActualCoverage(
  slots: PlanVsActualCoverageSlot[],
  bookings: PlanVsActualBooking[],
  options: { coverageThreshold?: number } = {},
): PlanVsActualCoverageResult {
  // A tiny overlap should not count as staffing coverage for the whole shift.
  // Defaulting to 50% keeps the pilot metric useful until a richer attendance
  // policy is configured per roster type.
  const coverageThreshold = options.coverageThreshold ?? 0.5;

  if (slots.length === 0) {
    return {
      totalSlots: 0,
      mismatchedSlots: 0,
      complianceRate: 1,
      understaffedSlots: 0,
      coverageRate: 1,
      durationCoverageRate: 1,
      slots: [],
    };
  }

  const allowedCategories = WORK_INTERVAL_TYPES;
  const bookingIndex = buildBookingIntervalIndex(bookings, allowedCategories);

  const slotResults = slots.map((slot) =>
    evaluateCoverageSlot(parseCoverageSlot(slot), bookingIndex, coverageThreshold),
  );

  const summary = comparePlanVsActual(
    slotResults.map((slot) => ({
      slotId: slot.shiftId,
      plannedHeadcount: slot.plannedHeadcount,
      actualHeadcount: slot.actualHeadcount,
    })),
  );

  const understaffedSlots = countUnderstaffedSlots(slotResults);
  const totalPlannedMinutes = totalPlannedCoverageMinutes(slotResults);
  const totalActualMinutes = totalActualCoverageMinutes(slotResults);

  return {
    ...summary,
    understaffedSlots,
    coverageRate: roundToTwo((slotResults.length - understaffedSlots) / slotResults.length),
    durationCoverageRate:
      totalPlannedMinutes > 0 ? roundToTwo(totalActualMinutes / totalPlannedMinutes) : 1,
    slots: slotResults,
  };
}
