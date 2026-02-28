import { describe, expect, it } from 'vitest';
import { resolveDelegation, shouldEscalate, transitionWorkflow } from '..';

describe('transitionWorkflow', () => {
  it('advances DRAFT to SUBMITTED', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-1',
      currentStatus: 'DRAFT',
      decision: 'SUBMIT',
      actorId: 'employee-1',
      at: '2026-03-01T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.nextStatus).toBe('SUBMITTED');
  });

  it('advances SUBMITTED to PENDING', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-2',
      currentStatus: 'SUBMITTED',
      decision: 'SUBMIT',
      actorId: 'employee-1',
      at: '2026-03-01T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.nextStatus).toBe('PENDING');
  });

  it('keeps status for delegation decision', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-3',
      currentStatus: 'PENDING',
      decision: 'DELEGATE',
      actorId: 'lead-1',
      at: '2026-03-01T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.nextStatus).toBe('PENDING');
  });

  it('escalates pending workflow', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-4',
      currentStatus: 'PENDING',
      decision: 'ESCALATE',
      actorId: 'system',
      at: '2026-03-01T10:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.nextStatus).toBe('ESCALATED');
  });

  it('rejects invalid transitions deterministically', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-5',
      currentStatus: 'APPROVED',
      decision: 'REJECT',
      actorId: 'lead-1',
      at: '2026-03-01T10:00:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.nextStatus).toBe('APPROVED');
    expect(result.violations[0]?.code).toBe('INVALID_TRANSITION');
  });

  it('sets decidedAt when at is omitted for valid transitions', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-6',
      currentStatus: 'PENDING',
      decision: 'APPROVE',
      actorId: 'lead-2',
    });

    expect(result.ok).toBe(true);
    expect(result.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('sets decidedAt when at is omitted for invalid transitions', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-7',
      currentStatus: 'CANCELLED',
      decision: 'APPROVE',
      actorId: 'lead-2',
    });

    expect(result.ok).toBe(false);
    expect(result.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
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
    expect(result.traversed).toEqual(['lead-primary', 'lead-deputy']);
    expect(result.cycleDetected).toBe(true);
    expect(result.maxDepthReached).toBe(false);
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

  it('accepts an available candidate without active window bounds', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-primary',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        {
          approverId: 'lead-deputy',
          isAvailable: true,
        },
      ],
    });

    expect(result.approverId).toBe('lead-deputy');
    expect(result.escalated).toBe(true);
  });

  it('treats missing activeTo as open-ended', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-primary',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        {
          approverId: 'lead-deputy',
          isAvailable: true,
          activeFrom: '2026-02-01T00:00:00.000Z',
        },
      ],
    });

    expect(result.approverId).toBe('lead-deputy');
    expect(result.escalated).toBe(true);
  });

  it('treats missing activeFrom as active since epoch', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-primary',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        {
          approverId: 'lead-deputy',
          isAvailable: true,
          activeTo: '2026-12-31T23:59:59.999Z',
        },
      ],
    });

    expect(result.approverId).toBe('lead-deputy');
    expect(result.escalated).toBe(true);
  });

  it('stops traversal when max depth is reached', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-primary',
      at: '2026-03-01T10:00:00.000Z',
      maxDepth: 2,
      fallbackChain: [
        {
          approverId: 'lead-2',
          isAvailable: false,
        },
        {
          approverId: 'lead-3',
          isAvailable: true,
        },
      ],
    });

    expect(result.approverId).toBe('lead-primary');
    expect(result.maxDepthReached).toBe(true);
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
