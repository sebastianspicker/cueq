import { describe, expect, it } from 'vitest';
import { mergePage, pagePath } from '../../src/shared/workspace/cursor-pages';
import {
  workedHours,
  progressPercent,
  targetInstant,
} from '../../src/app/[locale]/dashboard/day-ledger-math';
import type { DashboardSummary } from '../../src/app/[locale]/dashboard/types';

describe('bounded workspace pages', () => {
  it('preserves filter parameters and encodes the opaque continuation token', () => {
    const url = new URL(
      pagePath('/v1/bookings/me?from=2026-09-01', 'opaque+/='),
      'https://example.test',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: '2026-09-01',
      limit: '50',
      cursor: 'opaque+/=',
    });
  });
  it('updates overlapping records without duplicating rows or losing previous pages', () => {
    expect(
      mergePage(
        [
          { id: 'a', value: 1 },
          { id: 'b', value: 1 },
        ],
        [
          { id: 'b', value: 2 },
          { id: 'c', value: 3 },
        ],
      ),
    ).toEqual([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'c', value: 3 },
    ]);
  });
  it('uses authoritative daily work totals independently of loaded booking rows', () => {
    const summary: DashboardSummary = {
      personId: 'synthetic',
      assignmentId: 'synthetic-appointment',
      modelName: 'Synthetic',
      dayStart: '2026-09-06T22:00:00.000Z',
      dayEnd: '2026-09-07T22:00:00.000Z',
      todayWorkedMilliseconds: 6 * 3600000,
      todayTargetHours: 8,
      todayBookingsCount: 101,
      currentBalanceHours: 0,
      hasFirstBooking: true,
      showOrientation: false,
      clockInTimeTypeId: null,
      quickActions: [],
      period: null,
      now: '2026-09-07T12:00:00.000Z',
    };
    expect(workedHours(summary)).toBe(6);
    expect(progressPercent(summary)).toBe(75);
    expect(targetInstant(summary)).toBe('2026-09-07T14:00:00.000Z');
  });
});
