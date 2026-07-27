import { describe, expect, it } from 'vitest';
import {
  ledgerHourMarks,
  ledgerPosition,
  progressPercent,
  targetInstant,
  workedHours,
} from './day-ledger-math';
import type { DashboardBooking, DashboardSummary } from './types';

const summaryBase: DashboardSummary = {
  personId: 'person-1',
  modelName: 'Flex',
  todayTargetHours: 8,
  currentBalanceHours: 0,
  todayBookingsCount: 1,
  hasFirstBooking: true,
  showOrientation: false,
  clockInTimeTypeId: 'type-1',
  period: null,
  quickActions: [],
  now: '2026-03-18T12:00:00.000Z',
};

describe('day-ledger-math', () => {
  it('maps Europe/Berlin wall-clock minutes and clamps ledger positions', () => {
    // 2026-03-18T07:00:00.000Z = 08:00 Europe/Berlin (CET, UTC+1)
    expect(ledgerPosition('2026-03-18T07:00:00.000Z')).toBe(0);
    // 17:00 Berlin
    expect(ledgerPosition('2026-03-18T16:00:00.000Z')).toBe(100);
    // Before window clamps to 0
    expect(ledgerPosition('2026-03-18T05:00:00.000Z')).toBe(0);
  });

  it('computes worked hours, progress, and target instant from open bookings', () => {
    const bookings: DashboardBooking[] = [
      {
        id: 'b1',
        startTime: '2026-03-18T08:00:00.000Z',
        endTime: null,
      },
    ];
    // 08:00Z–12:00Z = 4 h worked toward 8 h target
    expect(workedHours(summaryBase, bookings)).toBe(4);
    expect(progressPercent(summaryBase, bookings)).toBe(50);
    expect(targetInstant(summaryBase, bookings)).toBe('2026-03-18T16:00:00.000Z');
  });

  it('returns the fixed hour marks for the ledger axis', () => {
    const hours = ledgerHourMarks();
    expect(hours[0]).toBe(8);
    expect(hours.at(-1)).toBe(17);
    expect(hours).toHaveLength(10);
  });
});
