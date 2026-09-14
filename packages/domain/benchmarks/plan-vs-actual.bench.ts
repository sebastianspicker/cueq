import { createHash } from 'node:crypto';
import { bench, describe } from 'vitest';
import {
  evaluatePlanVsActualCoverage,
  type PlanVsActualBooking,
  type PlanVsActualCoverageSlot,
} from '../src/roster/plan-vs-actual.js';

const SLOT_COUNT = 400;
const BOOKINGS_PER_SLOT = 10;
const MINUTE_MS = 60_000;
const SLOT_STRIDE_MINUTES = 90;
const fixtureStartMs = Date.parse('2026-01-05T08:00:00.000Z');
const EXPECTED_OUTPUT_SHA256 = '5dc9820bd203c9620895b7d5def0c0f319783f3a69b0c0e2c7153a77f6998376';

function isoAt(minutesFromStart: number): string {
  return new Date(fixtureStartMs + minutesFromStart * MINUTE_MS).toISOString();
}

function buildFixture(): {
  slots: PlanVsActualCoverageSlot[];
  bookings: PlanVsActualBooking[];
} {
  const slots: PlanVsActualCoverageSlot[] = [];
  const bookings: PlanVsActualBooking[] = [];

  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex += 1) {
    const slotStart = slotIndex * SLOT_STRIDE_MINUTES;
    const personPrefix = `slot-${slotIndex}`;

    slots.push({
      shiftId: personPrefix,
      startTime: isoAt(slotStart),
      endTime: isoAt(slotStart + 60),
      shiftType: 'DAY',
      minStaffing: 3,
      assignedPersonIds: [`${personPrefix}-0`, `${personPrefix}-1`, `${personPrefix}-1`],
    });

    const bookingParts = [
      [0, 30, 'WORK', 0],
      [30, 60, 'WORK', 0],
      [-15, 20, 'WORK', 1],
      [20, 45, 'WORK', 1],
      [10, 30, 'WORK', 2],
      [25, 55, 'WORK', 2],
      [0, 20, 'DEPLOYMENT', 3],
      [40, 60, 'DEPLOYMENT', 3],
      [0, 60, 'PAUSE', 4],
      [0, 60, 'ABSENCE', 5],
    ] as const;

    for (const [startOffset, endOffset, timeTypeCategory, personIndex] of bookingParts) {
      bookings.push({
        personId: `${personPrefix}-${personIndex}`,
        startTime: isoAt(slotStart + startOffset),
        endTime: isoAt(slotStart + endOffset),
        timeTypeCategory,
      });
    }
  }

  if (slots.length !== SLOT_COUNT || bookings.length !== SLOT_COUNT * BOOKINGS_PER_SLOT) {
    throw new Error('Roster benchmark fixture size drifted.');
  }

  return { slots, bookings };
}

const fixture = buildFixture();
const outputDigest = createHash('sha256')
  .update(JSON.stringify(evaluatePlanVsActualCoverage(fixture.slots, fixture.bookings)))
  .digest('hex');

if (outputDigest !== EXPECTED_OUTPUT_SHA256) {
  throw new Error(`Roster benchmark output changed: ${outputDigest}`);
}

console.info(
  `fixture=${fixture.slots.length} slots/${fixture.bookings.length} bookings output-sha256=${outputDigest}`,
);

describe('evaluatePlanVsActualCoverage', () => {
  bench(
    '400 slots and 4,000 bookings',
    () => evaluatePlanVsActualCoverage(fixture.slots, fixture.bookings),
    {
      time: 0,
      iterations: 30,
      warmupTime: 0,
      warmupIterations: 5,
    },
  );
});
