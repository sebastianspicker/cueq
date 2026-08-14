import { describe, expect, it } from 'vitest';
import { isWorkIntervalType } from './surcharge-test-support.js';

describe('isWorkIntervalType', () => {
  it('classifies WORK and DEPLOYMENT as work', () => {
    expect(isWorkIntervalType('WORK')).toBe(true);
    expect(isWorkIntervalType('DEPLOYMENT')).toBe(true);
  });

  it('does not classify PAUSE or unknown types as work', () => {
    expect(isWorkIntervalType('PAUSE')).toBe(false);
    expect(isWorkIntervalType('BREAK')).toBe(false);
    expect(isWorkIntervalType('')).toBe(false);
  });
});
