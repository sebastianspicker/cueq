import { describe, expect, it } from 'vitest';
import { isWithinWindow, nightEnd, nightStart } from './surcharge-test-support.js';

describe('isWithinWindow', () => {
  it('identifies minutes within cross-midnight window', () => {
    expect(isWithinWindow(1200, nightStart, nightEnd)).toBe(true); // exactly 20:00
    expect(isWithinWindow(1320, nightStart, nightEnd)).toBe(true); // 22:00
    expect(isWithinWindow(0, nightStart, nightEnd)).toBe(true); // 00:00 (after midnight)
    expect(isWithinWindow(300, nightStart, nightEnd)).toBe(true); // 05:00
  });

  it('excludes minutes outside cross-midnight window', () => {
    expect(isWithinWindow(360, nightStart, nightEnd)).toBe(false); // exactly 06:00 (exclusive end)
    expect(isWithinWindow(720, nightStart, nightEnd)).toBe(false); // 12:00
    expect(isWithinWindow(1199, nightStart, nightEnd)).toBe(false); // 19:59
  });

  it('handles non-crossing window (e.g. 08:00-17:00)', () => {
    const start = 480; // 08:00
    const end = 1020; // 17:00
    expect(isWithinWindow(480, start, end)).toBe(true); // exactly 08:00
    expect(isWithinWindow(720, start, end)).toBe(true); // 12:00
    expect(isWithinWindow(1019, start, end)).toBe(true); // 16:59
    expect(isWithinWindow(1020, start, end)).toBe(false); // exactly 17:00 (exclusive)
    expect(isWithinWindow(479, start, end)).toBe(false); // 07:59
  });

  it('returns true for all minutes when start === end (full 24h window)', () => {
    expect(isWithinWindow(0, 720, 720)).toBe(true);
    expect(isWithinWindow(720, 720, 720)).toBe(true);
    expect(isWithinWindow(1439, 720, 720)).toBe(true);
  });
});
