import { WORK_INTERVAL_TYPES } from '../constants.js';
import { roundToTwo } from '../utils.js';

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

function overlapRange(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): MinuteRange | null {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();

  if (aStart >= bEnd || bStart >= aEnd) {
    return null;
  }

  return {
    start: Math.max(aStart, bStart),
    end: Math.min(aEnd, bEnd),
  };
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

function slotDurationMinutes(slot: PlanVsActualCoverageSlot): number {
  return (new Date(slot.endTime).getTime() - new Date(slot.startTime).getTime()) / 60_000;
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
  slot: PlanVsActualCoverageSlot,
  bookings: PlanVsActualBooking[],
  allowedCategories: ReadonlySet<string>,
): Map<string, MinuteRange[]> {
  const slotStartMs = new Date(slot.startTime).getTime();
  const bookingRangesByPerson = new Map<string, MinuteRange[]>();

  for (const booking of bookings) {
    if (!allowedCategories.has(booking.timeTypeCategory)) {
      continue;
    }

    const coveredRange = overlapRange(
      slot.startTime,
      slot.endTime,
      booking.startTime,
      booking.endTime,
    );
    if (!coveredRange) {
      continue;
    }

    const ranges = bookingRangesByPerson.get(booking.personId) ?? [];
    ranges.push({
      start: coveredRange.start - slotStartMs,
      end: coveredRange.end - slotStartMs,
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
  slot: PlanVsActualCoverageSlot,
  bookings: PlanVsActualBooking[],
  coverageThreshold: number,
  allowedCategories: ReadonlySet<string>,
): PlanVsActualCoverageSlotResult {
  const { assignedHeadcount, plannedHeadcount: plannedSlotHeadcount } = plannedHeadcount(slot);
  const durationMinutes = slotDurationMinutes(slot);
  const minimumCoverageMinutes = durationMinutes * coverageThreshold;
  const bookingRangesByPerson = collectBookingRangesByPerson(slot, bookings, allowedCategories);
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

  const slotResults = slots.map((slot) =>
    evaluateCoverageSlot(slot, bookings, coverageThreshold, allowedCategories),
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
