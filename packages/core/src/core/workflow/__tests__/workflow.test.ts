import { describe, expect, it, vi } from 'vitest';
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

  it('sets decidedAt to current time when at is omitted for valid transitions', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T09:30:00.000Z') });
    try {
      const result = transitionWorkflow({
        workflowId: 'wf-6',
        currentStatus: 'PENDING',
        decision: 'APPROVE',
        actorId: 'lead-2',
      });

      expect(result.ok).toBe(true);
      expect(result.decidedAt).toBe('2026-06-15T09:30:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sets decidedAt to current time when at is omitted for invalid transitions', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T09:30:00.000Z') });
    try {
      const result = transitionWorkflow({
        workflowId: 'wf-7',
        currentStatus: 'CANCELLED',
        decision: 'APPROVE',
        actorId: 'lead-2',
      });

      expect(result.ok).toBe(false);
      expect(result.decidedAt).toBe('2026-06-15T09:30:00.000Z');
    } finally {
      vi.useRealTimers();
    }
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

describe('transitionWorkflow — exhaustive FSM transitions', () => {
  const at = '2026-03-01T10:00:00.000Z';
  const base = { workflowId: 'wf-fsm', actorId: 'actor-1', at };

  // ─── Valid transitions ───────────────────────────────────────
  it.each([
    // DRAFT
    ['DRAFT', 'SUBMIT', 'SUBMITTED'],
    ['DRAFT', 'CANCEL', 'CANCELLED'],
    // SUBMITTED
    ['SUBMITTED', 'SUBMIT', 'PENDING'],
    ['SUBMITTED', 'DELEGATE', 'SUBMITTED'],
    ['SUBMITTED', 'CANCEL', 'CANCELLED'],
    // PENDING
    ['PENDING', 'APPROVE', 'APPROVED'],
    ['PENDING', 'REJECT', 'REJECTED'],
    ['PENDING', 'ESCALATE', 'ESCALATED'],
    ['PENDING', 'DELEGATE', 'PENDING'],
    ['PENDING', 'CANCEL', 'CANCELLED'],
    // ESCALATED
    ['ESCALATED', 'APPROVE', 'APPROVED'],
    ['ESCALATED', 'REJECT', 'REJECTED'],
    ['ESCALATED', 'DELEGATE', 'ESCALATED'],
    ['ESCALATED', 'CANCEL', 'CANCELLED'],
  ] as const)('allows %s + %s → %s', (currentStatus, decision, expectedStatus) => {
    const result = transitionWorkflow({ ...base, currentStatus, decision });
    expect(result.ok).toBe(true);
    expect(result.nextStatus).toBe(expectedStatus);
    expect(result.violations).toEqual([]);
  });

  // ─── Invalid transitions ─────────────────────────────────────
  it.each([
    // DRAFT: cannot approve, reject, escalate, delegate
    ['DRAFT', 'APPROVE'],
    ['DRAFT', 'REJECT'],
    ['DRAFT', 'ESCALATE'],
    ['DRAFT', 'DELEGATE'],
    // SUBMITTED: cannot approve, reject, escalate
    ['SUBMITTED', 'APPROVE'],
    ['SUBMITTED', 'REJECT'],
    ['SUBMITTED', 'ESCALATE'],
    // PENDING: cannot submit
    ['PENDING', 'SUBMIT'],
    // ESCALATED: cannot submit, escalate
    ['ESCALATED', 'SUBMIT'],
    ['ESCALATED', 'ESCALATE'],
    // Terminal states: nothing allowed
    ['APPROVED', 'SUBMIT'],
    ['APPROVED', 'APPROVE'],
    ['APPROVED', 'REJECT'],
    ['APPROVED', 'ESCALATE'],
    ['APPROVED', 'DELEGATE'],
    ['APPROVED', 'CANCEL'],
    ['REJECTED', 'SUBMIT'],
    ['REJECTED', 'APPROVE'],
    ['REJECTED', 'REJECT'],
    ['REJECTED', 'CANCEL'],
    ['CANCELLED', 'SUBMIT'],
    ['CANCELLED', 'APPROVE'],
    ['CANCELLED', 'CANCEL'],
  ] as const)('rejects %s + %s', (currentStatus, decision) => {
    const result = transitionWorkflow({ ...base, currentStatus, decision });
    expect(result.ok).toBe(false);
    expect(result.nextStatus).toBe(currentStatus);
    expect(result.violations[0]?.code).toBe('INVALID_TRANSITION');
  });
});

describe('transitionWorkflow — concurrent approval (idempotency)', () => {
  const at = '2026-03-01T10:00:00.000Z';

  it('first approval succeeds from PENDING', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-concurrent',
      currentStatus: 'PENDING',
      decision: 'APPROVE',
      actorId: 'lead-1',
      at,
    });
    expect(result.ok).toBe(true);
    expect(result.nextStatus).toBe('APPROVED');
  });

  it('second approval attempt from APPROVED fails (terminal state)', () => {
    // After the first approval, the workflow is now APPROVED.
    // A second approval attempt should be rejected.
    const result = transitionWorkflow({
      workflowId: 'wf-concurrent',
      currentStatus: 'APPROVED',
      decision: 'APPROVE',
      actorId: 'lead-2',
      at,
    });
    expect(result.ok).toBe(false);
    expect(result.nextStatus).toBe('APPROVED');
    expect(result.violations[0]?.code).toBe('INVALID_TRANSITION');
  });

  it('rejection after approval fails (terminal state)', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-concurrent',
      currentStatus: 'APPROVED',
      decision: 'REJECT',
      actorId: 'lead-2',
      at,
    });
    expect(result.ok).toBe(false);
    expect(result.nextStatus).toBe('APPROVED');
  });

  it('cancellation after rejection fails (terminal state)', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-concurrent',
      currentStatus: 'REJECTED',
      decision: 'CANCEL',
      actorId: 'employee-1',
      at,
    });
    expect(result.ok).toBe(false);
    expect(result.nextStatus).toBe('REJECTED');
  });
});

describe('resolveDelegation — chain traversal A→B→C', () => {
  it('resolves through a 3-level delegation chain', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-A',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        { approverId: 'lead-A', isAvailable: false }, // A unavailable
        { approverId: 'lead-B', isAvailable: false }, // B unavailable
        { approverId: 'lead-C', isAvailable: true }, // C available → selected
      ],
    });

    expect(result.approverId).toBe('lead-C');
    expect(result.escalated).toBe(true);
    expect(result.traversed).toEqual(['lead-A', 'lead-B', 'lead-C']);
    expect(result.cycleDetected).toBe(true); // lead-A appears in both primary and chain
  });

  it('resolves 5-level chain at max default depth', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-1',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        { approverId: 'lead-2', isAvailable: false },
        { approverId: 'lead-3', isAvailable: false },
        { approverId: 'lead-4', isAvailable: false },
        { approverId: 'lead-5', isAvailable: true }, // at depth 5
        { approverId: 'lead-6', isAvailable: true },
      ],
    });

    // Default maxDepth is 5. traversed = [lead-1, lead-2, lead-3, lead-4, lead-5]
    // At iteration for lead-5: traversed.length = 4 (after adding lead-4), so lead-5 is processed
    expect(result.approverId).toBe('lead-5');
    expect(result.traversed.length).toBe(5);
  });

  it('skips candidates who are the requester (prevents self-approval)', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-A',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        { approverId: 'employee-1', isAvailable: true }, // requester, skipped
        { approverId: 'lead-B', isAvailable: true },
      ],
    });

    expect(result.approverId).toBe('lead-B');
    expect(result.escalated).toBe(true);
  });
});

describe('resolveDelegation — circular delegation', () => {
  it('detects cycle when candidate appears twice in chain', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-A',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        { approverId: 'lead-B', isAvailable: false },
        { approverId: 'lead-A', isAvailable: true }, // cycle: lead-A already primary
        { approverId: 'lead-C', isAvailable: true },
      ],
    });

    expect(result.cycleDetected).toBe(true);
    // lead-A is skipped as cycle, lead-C is selected
    expect(result.approverId).toBe('lead-C');
  });

  it('detects cycle with duplicate non-primary candidates', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-A',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        { approverId: 'lead-B', isAvailable: false },
        { approverId: 'lead-B', isAvailable: true }, // duplicate
        { approverId: 'lead-C', isAvailable: true },
      ],
    });

    expect(result.cycleDetected).toBe(true);
    expect(result.approverId).toBe('lead-C');
  });

  it('falls back to primary when all candidates are cycles or unavailable', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-A',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        { approverId: 'lead-A', isAvailable: true }, // cycle
        { approverId: 'lead-A', isAvailable: true }, // cycle again
      ],
    });

    expect(result.cycleDetected).toBe(true);
    expect(result.approverId).toBe('lead-A'); // fallback to primary
    expect(result.escalated).toBe(false);
  });
});

describe('resolveDelegation — maxDelegationDepth enforcement', () => {
  it('enforces maxDepth=1 (only primary, no fallback)', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-A',
      at: '2026-03-01T10:00:00.000Z',
      maxDepth: 1,
      fallbackChain: [{ approverId: 'lead-B', isAvailable: true }],
    });

    // traversed = ['lead-A'], then trying lead-B but traversed.length (1) >= maxDepth (1)
    expect(result.maxDepthReached).toBe(true);
    expect(result.approverId).toBe('lead-A');
    expect(result.traversed).toEqual(['lead-A']);
  });

  it('enforces maxDepth=3 in a long chain', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-1',
      at: '2026-03-01T10:00:00.000Z',
      maxDepth: 3,
      fallbackChain: [
        { approverId: 'lead-2', isAvailable: false },
        { approverId: 'lead-3', isAvailable: false },
        { approverId: 'lead-4', isAvailable: true }, // would be at depth 4, beyond limit
      ],
    });

    expect(result.maxDepthReached).toBe(true);
    expect(result.traversed.length).toBeLessThanOrEqual(3);
    expect(result.approverId).toBe('lead-1'); // falls back to primary
  });

  it('clamps maxDepth < 1 to 1', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-A',
      at: '2026-03-01T10:00:00.000Z',
      maxDepth: 0,
      fallbackChain: [{ approverId: 'lead-B', isAvailable: true }],
    });

    // maxDepth clamped to 1
    expect(result.maxDepthReached).toBe(true);
    expect(result.approverId).toBe('lead-A');
  });

  it('uses default maxDepth of 5 when omitted', () => {
    const result = resolveDelegation({
      requesterId: 'employee-1',
      primaryApproverId: 'lead-1',
      at: '2026-03-01T10:00:00.000Z',
      fallbackChain: [
        { approverId: 'lead-2', isAvailable: false },
        { approverId: 'lead-3', isAvailable: false },
        { approverId: 'lead-4', isAvailable: false },
        { approverId: 'lead-5', isAvailable: false },
        { approverId: 'lead-6', isAvailable: true }, // beyond default depth 5
      ],
    });

    // traversed has 5 entries (lead-1 through lead-5), then maxDepth reached
    expect(result.maxDepthReached).toBe(true);
    expect(result.approverId).toBe('lead-1');
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

  it('escalates exactly at the deadline boundary (>= comparison)', () => {
    const escalated = shouldEscalate({
      currentStatus: 'PENDING',
      submittedAt: '2026-03-01T08:00:00.000Z',
      now: '2026-03-02T08:00:00.000Z', // exactly 24h later
      escalationDeadlineHours: 24,
    });

    expect(escalated).toBe(true);
  });

  it('does not escalate SUBMITTED workflows', () => {
    const escalated = shouldEscalate({
      currentStatus: 'SUBMITTED',
      submittedAt: '2026-03-01T08:00:00.000Z',
      now: '2026-03-05T08:00:00.000Z',
      escalationDeadlineHours: 24,
    });

    expect(escalated).toBe(false);
  });

  it('does not escalate ESCALATED workflows (already escalated)', () => {
    const escalated = shouldEscalate({
      currentStatus: 'ESCALATED',
      submittedAt: '2026-03-01T08:00:00.000Z',
      now: '2026-03-05T08:00:00.000Z',
      escalationDeadlineHours: 24,
    });

    expect(escalated).toBe(false);
  });

  it('does not escalate DRAFT workflows', () => {
    const escalated = shouldEscalate({
      currentStatus: 'DRAFT',
      submittedAt: '2026-03-01T08:00:00.000Z',
      now: '2026-03-05T08:00:00.000Z',
      escalationDeadlineHours: 24,
    });

    expect(escalated).toBe(false);
  });

  it('handles 48-hour deadline correctly', () => {
    expect(
      shouldEscalate({
        currentStatus: 'PENDING',
        submittedAt: '2026-03-01T08:00:00.000Z',
        now: '2026-03-03T07:59:59.999Z',
        escalationDeadlineHours: 48,
      }),
    ).toBe(false);

    expect(
      shouldEscalate({
        currentStatus: 'PENDING',
        submittedAt: '2026-03-01T08:00:00.000Z',
        now: '2026-03-03T08:00:00.000Z',
        escalationDeadlineHours: 48,
      }),
    ).toBe(true);
  });
});

describe('workflow — escalation + FSM integration', () => {
  it('escalation followed by approval is a valid path', () => {
    // Step 1: Escalate from PENDING
    const escalation = transitionWorkflow({
      workflowId: 'wf-esc-path',
      currentStatus: 'PENDING',
      decision: 'ESCALATE',
      actorId: 'system',
      at: '2026-03-02T10:00:00.000Z',
    });
    expect(escalation.ok).toBe(true);
    expect(escalation.nextStatus).toBe('ESCALATED');

    // Step 2: Approve from ESCALATED
    const approval = transitionWorkflow({
      workflowId: 'wf-esc-path',
      currentStatus: escalation.nextStatus,
      decision: 'APPROVE',
      actorId: 'hr-admin',
      at: '2026-03-02T11:00:00.000Z',
    });
    expect(approval.ok).toBe(true);
    expect(approval.nextStatus).toBe('APPROVED');
  });

  it('escalation followed by rejection is a valid path', () => {
    const escalation = transitionWorkflow({
      workflowId: 'wf-esc-rej',
      currentStatus: 'PENDING',
      decision: 'ESCALATE',
      actorId: 'system',
      at: '2026-03-02T10:00:00.000Z',
    });
    expect(escalation.nextStatus).toBe('ESCALATED');

    const rejection = transitionWorkflow({
      workflowId: 'wf-esc-rej',
      currentStatus: escalation.nextStatus,
      decision: 'REJECT',
      actorId: 'hr-admin',
      at: '2026-03-02T11:00:00.000Z',
    });
    expect(rejection.ok).toBe(true);
    expect(rejection.nextStatus).toBe('REJECTED');
  });

  it('re-escalation from ESCALATED is not allowed', () => {
    const result = transitionWorkflow({
      workflowId: 'wf-re-esc',
      currentStatus: 'ESCALATED',
      decision: 'ESCALATE',
      actorId: 'system',
      at: '2026-03-02T10:00:00.000Z',
    });
    expect(result.ok).toBe(false);
    expect(result.nextStatus).toBe('ESCALATED');
  });
});
