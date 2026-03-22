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

  it.each([
    {
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      after: { hours: 8, date: '2026-03-10' },
    },
    {
      action: 'BOOKING_UPDATED',
      entityType: 'Booking',
      before: { hours: 8 },
      after: { hours: 7.5 },
    },
    {
      action: 'BOOKING_DELETED',
      entityType: 'Booking',
      before: { hours: 8 },
    },
    {
      action: 'LEAVE_APPROVED',
      entityType: 'Absence',
      before: { status: 'REQUESTED' },
      after: { status: 'APPROVED' },
      reason: 'Manager approved',
    },
    {
      action: 'LEAVE_REJECTED',
      entityType: 'Absence',
      before: { status: 'REQUESTED' },
      after: { status: 'REJECTED' },
      reason: 'Insufficient balance',
    },
    {
      action: 'CLOSING_EXPORTED',
      entityType: 'ClosingPeriod',
      after: { status: 'EXPORTED', checksum: 'abc123' },
    },
    {
      action: 'POST_CLOSE_CORRECTION_APPLIED',
      entityType: 'ClosingPeriod',
      before: { status: 'EXPORTED' },
      after: { status: 'REVIEW' },
      reason: 'Correction by HR',
    },
    {
      action: 'WORKFLOW_ESCALATED',
      entityType: 'Workflow',
      after: { status: 'ESCALATED', level: 2 },
    },
  ])(
    'produces valid AuditEntryDraft for $action',
    ({ action, entityType, before, after, reason }) => {
      const entry = buildAuditEntry({
        actorId: 'actor-1',
        action,
        entityType,
        entityId: `${entityType.toLowerCase()}-1`,
        before,
        after,
        reason,
      });

      // Structure validation
      expect(entry.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(entry.actorId).toBe('actor-1');
      expect(entry.action).toBe(action);
      expect(entry.entityType).toBe(entityType);

      // Immutability
      expect(Object.isFrozen(entry)).toBe(true);

      // Optional fields
      if (before) expect(entry.before).toEqual(before);
      if (after) expect(entry.after).toEqual(after);
      if (reason) expect(entry.reason).toBe(reason);
    },
  );

  it('uses provided id and timestamp when supplied', () => {
    const entry = buildAuditEntry({
      id: 'custom-id-123',
      timestamp: '2026-03-10T12:00:00.000Z',
      actorId: 'system',
      action: 'MIGRATION_RUN',
      entityType: 'System',
      entityId: 'migration-1',
    });

    expect(entry.id).toBe('custom-id-123');
    expect(entry.timestamp).toBe('2026-03-10T12:00:00.000Z');
  });

  it('includes metadata when provided', () => {
    const entry = buildAuditEntry({
      actorId: 'admin-1',
      action: 'ROSTER_PUBLISHED',
      entityType: 'Roster',
      entityId: 'roster-1',
      metadata: { source: 'api', correlationId: 'req-abc' },
    });

    expect(entry.metadata).toEqual({ source: 'api', correlationId: 'req-abc' });
    expect(Object.isFrozen(entry.metadata)).toBe(true);
  });

  it('defaults reason to null when not provided', () => {
    const entry = buildAuditEntry({
      actorId: 'user-1',
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: 'booking-1',
    });

    expect(entry.reason).toBeNull();
  });
});
