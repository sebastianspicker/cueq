import { describe, expect, it } from 'vitest';
import { resolveDelegation, shouldEscalate, transitionWorkflow } from '..';

describe('transitionWorkflow', () => {
  it('allows valid transitions', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-1',
      currentStatus: 'PENDING',
      decision: 'APPROVE',
      actorId: 'lead-1',
      at: '2026-03-01T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.nextStatus).toBe('APPROVED');
    expect(result.violations).toEqual([]);
  });

  it('rejects invalid transitions deterministically', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-2',
      currentStatus: 'APPROVED',
      decision: 'REJECT',
      actorId: 'lead-1',
      at: '2026-03-01T10:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.nextStatus).toBe('APPROVED');
    expect(result.violations[0]?.code).toBe('INVALID_TRANSITION');
  });
});

describe('resolveDelegation', () => {
  it('selects first available candidate in the delegation chain', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-primary',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        {
          approverId: 'lead-primary',
          isAvailable: false,
        },
        {
          approverId: 'lead-deputy',
          isAvailable: true,
          activeFrom: '2026-01-01T00:00:00.000Z',
          activeTo: '2026-12-31T23:59:59.999Z',
        },
      ],
    });

    expect(result.approverId).toBe('lead-deputy');
    expect(result.escalated).toBe(true);
    expect(result.traversed).toEqual(['lead-primary', 'lead-primary', 'lead-deputy']);
  });

  it('falls back to primary approver when no candidate is available', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-primary',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        {
          approverId: 'employee-1',
          isAvailable: true,
        },
        {
          approverId: 'lead-deputy',
          isAvailable: true,
          activeFrom: '2027-01-01T00:00:00.000Z',
          activeTo: '2027-12-31T23:59:59.999Z',
        },
      ],
    });

    expect(result.approverId).toBe('lead-primary');
    expect(result.escalated).toBe(false);
  });
});

describe('shouldEscalate', () => {
  it('escalates overdue pending workflows', () => {
    const escalated = shouldEscalate({
      currentStatus: 'PENDING',
      submittedAt: '2026-03-01T08:00:00.000Z',
      now: '2026-03-02T10:00:00.000Z',
      escalationDeadlineHours: 24,
    });

    expect(escalated).toBe(true);
  });

  it('does not escalate non-pending workflows', () => {
    const escalated = shouldEscalate({
      currentStatus: 'APPROVED',
      submittedAt: '2026-03-01T08:00:00.000Z',
      now: '2026-03-02T10:00:00.000Z',
      escalationDeadlineHours: 24,
    });

    expect(escalated).toBe(false);
  });

  it('does not escalate before the deadline', () => {
    const escalated = shouldEscalate({
      currentStatus: 'PENDING',
      submittedAt: '2026-03-01T08:00:00.000Z',
      now: '2026-03-01T12:00:00.000Z',
      escalationDeadlineHours: 24,
    });

    expect(escalated).toBe(false);
  });
});
