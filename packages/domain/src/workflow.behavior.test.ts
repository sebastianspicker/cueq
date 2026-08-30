import { describe, expect, it } from 'vitest';
import { resolveDelegation, shouldEscalate, transitionWorkflow } from './index.js';

describe('workflow transition state machine through the public domain API', () => {
  it.each([
    ['DRAFT', 'SUBMIT', 'SUBMITTED'],
    ['SUBMITTED', 'SUBMIT', 'PENDING'],
    ['SUBMITTED', 'DELEGATE', 'SUBMITTED'],
    ['PENDING', 'APPROVE', 'APPROVED'],
    ['PENDING', 'REJECT', 'REJECTED'],
    ['PENDING', 'ESCALATE', 'ESCALATED'],
    ['ESCALATED', 'APPROVE', 'APPROVED'],
    ['ESCALATED', 'REJECT', 'REJECTED'],
    ['DRAFT', 'CANCEL', 'CANCELLED'],
  ] as const)('allows %s -> %s -> %s', (currentStatus, decision, nextStatus) => {
    expect(
      transitionWorkflow({
        workflowId: 'workflow-1',
        actorId: 'actor-1',
        currentStatus,
        decision,
        at: '2026-03-01T09:00:00.000Z',
      }),
    ).toEqual({ ok: true, nextStatus, decidedAt: '2026-03-01T09:00:00.000Z', violations: [] });
  });

  it.each([
    ['DRAFT', 'APPROVE'],
    ['APPROVED', 'CANCEL'],
    ['REJECTED', 'SUBMIT'],
    ['CANCELLED', 'DELEGATE'],
  ] as const)('rejects an unavailable decision from %s', (currentStatus, decision) => {
    const result = transitionWorkflow({
      workflowId: 'workflow-1',
      actorId: 'actor-1',
      reason: 'test',
      currentStatus,
      decision,
      at: '2026-03-01T09:00:00.000Z',
    });

    expect(result).toMatchObject({ ok: false, nextStatus: currentStatus });
    expect(result.violations[0]).toMatchObject({
      code: 'INVALID_TRANSITION',
      context: { reason: 'test' },
    });
  });
});

describe('workflow delegation and escalation boundaries', () => {
  it.each([
    {
      name: 'selects the first available, active fallback',
      input: {
        requesterId: 'requester',
        primaryApproverId: 'lead',
        at: '2026-03-01T12:00:00.000Z',
        fallbackChain: [
          { approverId: 'lead', isAvailable: true },
          { approverId: 'requester', isAvailable: true },
          { approverId: 'hr', isAvailable: true, activeFrom: '2026-02-01T00:00:00.000Z' },
        ],
      },
      expected: {
        approverId: 'hr',
        escalated: true,
        traversed: ['lead', 'requester', 'hr'],
        cycleDetected: true,
        maxDepthReached: false,
      },
    },
    {
      name: 'falls back after unavailable or inactive candidates',
      input: {
        requesterId: 'requester',
        primaryApproverId: 'lead',
        at: '2026-03-01T12:00:00.000Z',
        fallbackChain: [
          { approverId: 'off-duty', isAvailable: true, activeTo: '2026-02-28T23:59:59.999Z' },
          { approverId: 'absent', isAvailable: false },
        ],
      },
      expected: {
        approverId: 'lead',
        escalated: false,
        traversed: ['lead', 'off-duty', 'absent'],
        cycleDetected: false,
        maxDepthReached: false,
      },
    },
    {
      name: 'stops at configured maximum depth',
      input: {
        requesterId: 'requester',
        primaryApproverId: 'lead',
        at: '2026-03-01T12:00:00.000Z',
        maxDepth: 2,
        fallbackChain: [
          { approverId: 'first', isAvailable: false },
          { approverId: 'second', isAvailable: true },
        ],
      },
      expected: {
        approverId: 'lead',
        escalated: false,
        traversed: ['lead', 'first'],
        cycleDetected: false,
        maxDepthReached: true,
      },
    },
  ])('$name', ({ input, expected }) => {
    expect(resolveDelegation(input)).toEqual(expected);
  });

  it.each([
    [
      {
        currentStatus: 'PENDING',
        submittedAt: '2026-03-01T00:00:00.000Z',
        now: '2026-03-01T12:00:00.000Z',
        escalationDeadlineHours: 12,
      },
      true,
    ],
    [
      {
        currentStatus: 'PENDING',
        submittedAt: '2026-03-01T00:00:00.000Z',
        now: '2026-03-01T11:59:59.000Z',
        escalationDeadlineHours: 12,
      },
      false,
    ],
    [
      {
        currentStatus: 'APPROVED',
        submittedAt: '2026-03-01T00:00:00.000Z',
        now: '2026-03-02T00:00:00.000Z',
        escalationDeadlineHours: 1,
      },
      false,
    ],
  ] as const)(
    'escalates only pending workflows at or after the configured deadline',
    (input, expected) => {
      expect(shouldEscalate(input)).toBe(expected);
    },
  );
});
