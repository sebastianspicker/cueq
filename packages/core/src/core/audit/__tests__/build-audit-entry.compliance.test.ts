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
});
