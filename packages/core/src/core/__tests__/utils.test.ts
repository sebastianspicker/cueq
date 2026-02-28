import { describe, expect, it } from 'vitest';
import { deepFreeze, diffHours, overlapExists } from '../utils';

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
