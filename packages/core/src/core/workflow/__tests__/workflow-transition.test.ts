import { describe, expect, it, vi } from 'vitest';
import { transitionWorkflow } from '../index.js';

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

describe('transitionWorkflow: exhaustive FSM transitions', () => {
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

describe('transitionWorkflow: concurrent approval (idempotency)', () => {
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
