import { describe, expect, it } from 'vitest';
import { buildAuditEntry } from '..';

describe('audit compliance', () => {
  it('preserves append-only semantics in runtime objects', () => {
    const entry = buildAuditEntry({
      actorId: 'hr-1',
      action: 'LEAVE_APPROVED',
      entityType: 'Absence',
      entityId: 'absence-1',
      before: { status: 'REQUESTED' },
      after: { status: 'APPROVED' },
      reason: 'All prerequisites met',
    });

    expect(entry.before).toEqual({ status: 'REQUESTED' });
    expect(entry.after).toEqual({ status: 'APPROVED' });
    expect(() => {
      (entry as Record<string, unknown>).action = 'MUTATED';
    }).toThrow();
  });

  it('prevents mutation of nested before/after payloads', () => {
    const entry = buildAuditEntry({
      actorId: 'hr-1',
      action: 'BOOKING_UPDATED',
      entityType: 'Booking',
      entityId: 'booking-1',
      before: { hours: 8, details: { note: 'original' } },
      after: { hours: 7.5, details: { note: 'corrected' } },
    });

    expect(() => {
      (entry.before as Record<string, unknown>).hours = 999;
    }).toThrow();
    expect(() => {
      ((entry.before as Record<string, unknown>).details as Record<string, unknown>).note =
        'tampered';
    }).toThrow();
  });

  it('prevents adding new properties to frozen audit entry', () => {
    const entry = buildAuditEntry({
      actorId: 'system',
      action: 'MIGRATION_RUN',
      entityType: 'System',
      entityId: 'migration-1',
    });

    expect(() => {
      (entry as Record<string, unknown>).injectedField = 'attack';
    }).toThrow();
  });

  it('prevents deleting properties from frozen audit entry', () => {
    const entry = buildAuditEntry({
      actorId: 'admin-1',
      action: 'CLOSING_EXPORTED',
      entityType: 'ClosingPeriod',
      entityId: 'period-1',
      reason: 'Monthly export',
    });

    expect(() => {
      delete (entry as Record<string, unknown>).reason;
    }).toThrow();
  });

  it('preserves all fields across freeze cycle', () => {
    const entry = buildAuditEntry({
      id: 'fixed-id',
      timestamp: '2026-03-10T00:00:00.000Z',
      actorId: 'hr-1',
      action: 'POST_CLOSE_CORRECTION_APPLIED',
      entityType: 'ClosingPeriod',
      entityId: 'period-2026-02',
      before: { status: 'EXPORTED' },
      after: { status: 'REVIEW' },
      reason: 'Correction needed',
      metadata: { correctionId: 'corr-1' },
    });

    // Verify every field survived the freeze intact
    expect(entry.id).toBe('fixed-id');
    expect(entry.timestamp).toBe('2026-03-10T00:00:00.000Z');
    expect(entry.actorId).toBe('hr-1');
    expect(entry.action).toBe('POST_CLOSE_CORRECTION_APPLIED');
    expect(entry.entityType).toBe('ClosingPeriod');
    expect(entry.entityId).toBe('period-2026-02');
    expect(entry.before).toEqual({ status: 'EXPORTED' });
    expect(entry.after).toEqual({ status: 'REVIEW' });
    expect(entry.reason).toBe('Correction needed');
    expect(entry.metadata).toEqual({ correctionId: 'corr-1' });
  });
});
