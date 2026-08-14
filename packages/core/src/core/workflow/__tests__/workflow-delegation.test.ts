import { describe, expect, it } from 'vitest';
import { resolveDelegation } from '../index.js';

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

describe('resolveDelegation: chain traversal A→B→C', () => {
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

describe('resolveDelegation: circular delegation', () => {
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

describe('resolveDelegation: maxDelegationDepth enforcement', () => {
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
