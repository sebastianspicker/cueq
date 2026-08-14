import { describe, expect, it } from 'vitest';
import { shouldEscalate, transitionWorkflow } from '../index.js';

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

describe('workflow: escalation + FSM integration', () => {
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
