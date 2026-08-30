import { describe, expect, it } from 'vitest';
import { buildAuditEntry, calculateAbsenceWorkingDays } from './index.js';

describe('public domain API', () => {
  it('exposes workforce calculations and immutable audit entry construction from the root barrel', () => {
    expect(
      calculateAbsenceWorkingDays({
        startDate: '2026-08-03',
        endDate: '2026-08-07',
        holidayDates: ['2026-08-05'],
      }),
    ).toBe(4);

    const entry = buildAuditEntry({
      id: 'audit-1',
      timestamp: '2026-08-03T09:00:00.000Z',
      actorId: 'person-1',
      action: 'ABSENCE_CREATED',
      entityType: 'Absence',
      entityId: 'absence-1',
      after: { status: 'REQUESTED' },
    });

    expect(entry).toMatchObject({ id: 'audit-1', entityId: 'absence-1' });
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.after)).toBe(true);
  });
});
