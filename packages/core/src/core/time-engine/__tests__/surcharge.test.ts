import { describe, expect, it } from 'vitest';
import { parseLocalTimeToMinute } from './surcharge-test-support.js';

describe('parseLocalTimeToMinute', () => {
  it('parses standard HH:MM times', () => {
    expect(parseLocalTimeToMinute('00:00')).toBe(0);
    expect(parseLocalTimeToMinute('06:00')).toBe(360);
    expect(parseLocalTimeToMinute('20:00')).toBe(1200);
    expect(parseLocalTimeToMinute('23:59')).toBe(1439);
  });

  it('returns null for invalid inputs', () => {
    expect(parseLocalTimeToMinute('')).toBeNull();
    expect(parseLocalTimeToMinute('25:00')).toBeNull();
    expect(parseLocalTimeToMinute('12:60')).toBeNull();
    expect(parseLocalTimeToMinute('ab:cd')).toBeNull();
    expect(parseLocalTimeToMinute('-1:00')).toBeNull();
    expect(parseLocalTimeToMinute('12')).toBeNull();
  });
});
