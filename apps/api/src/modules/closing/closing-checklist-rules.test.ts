import { TimeTypeCategory } from '@cueq/database';
import { describe, expect, it } from 'vitest';
import {
  calculateClosingBookingMetrics,
  type ClosingChecklistBooking,
} from './closing-checklist-rules.js';

const thresholds = { dailyMaxMinutes: 16 * 60, minRestMinutes: 11 * 60 };

function booking(
  assignmentId: string,
  startTime: string,
  endTime: string,
): ClosingChecklistBooking {
  return {
    personId: 'person-1',
    assignmentId,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    timeType: { category: TimeTypeCategory.WORK },
  };
}

describe('closing checklist appointment metrics', () => {
  it('does not use leave from one appointment as coverage for another', () => {
    const result = calculateClosingBookingMetrics(
      [],
      [],
      [{ assignmentId: 'assignment-b' }],
      2,
      'period-1',
      thresholds,
    );

    expect(result.missingBookings).toBe(1);
  });

  it('evaluates rest and booking gaps across all appointments of one person', () => {
    const first = booking('assignment-a', '2026-03-02T08:00:00.000Z', '2026-03-02T12:00:00.000Z');
    const second = booking('assignment-b', '2026-03-02T17:00:00.000Z', '2026-03-02T20:00:00.000Z');

    const result = calculateClosingBookingMetrics(
      [first, second],
      [first, second],
      [],
      2,
      'period-1',
      thresholds,
    );

    expect(result.missingBookings).toBe(0);
    expect(result.bookingGaps).toBe(1);
    expect(result.ruleViolations).toBeGreaterThan(0);
  });
});
