import { describe, expect, it } from 'vitest';
import { buildAuditEntry } from '..';

describe('buildAuditEntry', () => {
  it('returns deeply immutable audit entries', () => {
    const entry = buildAuditEntry({
      actorId: 'user-1',
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: 'booking-1',
      after: { nested: { value: 1 } },
    });

    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.after as object)).toBe(true);
    expect(Object.isFrozen((entry.after as { nested: object }).nested)).toBe(true);
  });
});
