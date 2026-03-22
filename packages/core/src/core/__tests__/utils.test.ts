import { afterEach, describe, expect, it, vi } from 'vitest';
import { deepFreeze, diffHours, overlapExists, roundToTwo, toIso, toViolation } from '../utils';

describe('utils', () => {
  it('throws for invalid ISO timestamps', () => {
    expect(() => diffHours('not-a-date', '2026-01-01T00:00:00.000Z')).toThrow('Invalid ISO date');
  });

  it('detects overlap intervals', () => {
    const issues = overlapExists([
      {
        start: '2026-01-01T08:00:00.000Z',
        end: '2026-01-01T10:00:00.000Z',
      },
      {
        start: '2026-01-01T09:00:00.000Z',
        end: '2026-01-01T11:00:00.000Z',
      },
    ]);

    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('OVERLAP');
  });

  it('deep-freezes nested objects', () => {
    const input = { top: { nested: true } };
    const frozen = deepFreeze(input);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.top)).toBe(true);
  });
});

describe('roundToTwo', () => {
  it('rounds to two decimal places', () => {
    expect(roundToTwo(1.005)).toBe(1.01);
    expect(roundToTwo(1.004)).toBe(1);
    expect(roundToTwo(1.555)).toBe(1.56);
  });

  it('preserves integers', () => {
    expect(roundToTwo(5)).toBe(5);
    expect(roundToTwo(0)).toBe(0);
  });

  it('handles negative values', () => {
    expect(roundToTwo(-1.555)).toBe(-1.55);
    // Number.EPSILON shifts -0.005 toward zero → rounds to -0
    expect(roundToTwo(-0.005)).toBe(-0);
  });

  it('handles already-rounded values', () => {
    expect(roundToTwo(1.23)).toBe(1.23);
    expect(roundToTwo(0.1)).toBe(0.1);
  });
});

describe('toViolation', () => {
  it('defaults severity to ERROR when not provided', () => {
    const violation = toViolation({
      code: 'BREAK_DEFICIT',
      message: 'Break too short',
    });
    expect(violation.severity).toBe('ERROR');
    expect(violation.code).toBe('BREAK_DEFICIT');
    expect(violation.message).toBe('Break too short');
  });

  it('uses provided severity when given', () => {
    const violation = toViolation({
      code: 'BREAK_DEFICIT',
      severity: 'WARNING',
      message: 'Break too short',
    });
    expect(violation.severity).toBe('WARNING');
  });

  it('passes through optional fields', () => {
    const violation = toViolation({
      code: 'REST_HOURS_DEFICIT',
      message: 'Insufficient rest',
      ruleId: 'rest-001',
      ruleName: 'MinRest',
      context: { hours: 9 },
    });
    expect(violation.ruleId).toBe('rest-001');
    expect(violation.ruleName).toBe('MinRest');
    expect(violation.context).toEqual({ hours: 9 });
  });
});

describe('toIso', () => {
  it('returns an ISO string for a given date', () => {
    const date = new Date('2026-03-10T12:00:00.000Z');
    expect(toIso(date)).toBe('2026-03-10T12:00:00.000Z');
  });

  it('returns current time ISO string when no argument is passed', () => {
    vi.useFakeTimers({ now: new Date('2026-06-15T09:30:00.000Z') });
    try {
      expect(toIso()).toBe('2026-06-15T09:30:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('diffHours', () => {
  it('calculates positive hour difference', () => {
    expect(diffHours('2026-03-10T08:00:00.000Z', '2026-03-10T16:00:00.000Z')).toBe(8);
  });

  it('calculates fractional hours', () => {
    expect(diffHours('2026-03-10T08:00:00.000Z', '2026-03-10T08:30:00.000Z')).toBe(0.5);
  });

  it('returns negative for reversed timestamps', () => {
    expect(diffHours('2026-03-10T16:00:00.000Z', '2026-03-10T08:00:00.000Z')).toBe(-8);
  });

  it('returns zero for identical timestamps', () => {
    expect(diffHours('2026-03-10T08:00:00.000Z', '2026-03-10T08:00:00.000Z')).toBe(0);
  });
});

describe('overlapExists', () => {
  it('returns empty for non-overlapping intervals', () => {
    const issues = overlapExists([
      { start: '2026-03-10T08:00:00.000Z', end: '2026-03-10T10:00:00.000Z' },
      { start: '2026-03-10T10:00:00.000Z', end: '2026-03-10T12:00:00.000Z' },
    ]);
    expect(issues).toEqual([]);
  });

  it('returns empty for a single interval', () => {
    const issues = overlapExists([
      { start: '2026-03-10T08:00:00.000Z', end: '2026-03-10T10:00:00.000Z' },
    ]);
    expect(issues).toEqual([]);
  });

  it('returns empty for an empty array', () => {
    expect(overlapExists([])).toEqual([]);
  });

  it('preserves original index in overlap context', () => {
    const issues = overlapExists([
      { start: '2026-03-10T12:00:00.000Z', end: '2026-03-10T14:00:00.000Z' },
      { start: '2026-03-10T08:00:00.000Z', end: '2026-03-10T13:00:00.000Z' },
    ]);
    expect(issues).toHaveLength(1);
    // After sorting by start, the 08:00 interval (original index 1) comes first;
    // overlap is reported with that interval's original index.
    expect(issues[0]?.index).toBe(1);
  });
});
