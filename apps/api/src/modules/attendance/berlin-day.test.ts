import { describe, expect, it } from 'vitest';
import { berlinDayBounds } from './berlin-day.js';

describe('Berlin calendar-day boundaries', () => {
  it.each([
    ['2026-03-29T12:00:00Z', '2026-03-28T23:00:00.000Z', '2026-03-29T22:00:00.000Z', 23],
    ['2026-10-25T12:00:00Z', '2026-10-24T22:00:00.000Z', '2026-10-25T23:00:00.000Z', 25],
    ['2026-08-31T23:30:00Z', '2026-08-31T22:00:00.000Z', '2026-09-01T22:00:00.000Z', 24],
    ['2026-12-31T23:30:00Z', '2026-12-31T23:00:00.000Z', '2027-01-01T23:00:00.000Z', 24],
  ])('uses calendar midnights for %s', (instant, start, end, hours) => {
    const result = berlinDayBounds(new Date(instant));
    expect(result.dayStart.toISOString()).toBe(start);
    expect(result.dayEnd.toISOString()).toBe(end);
    expect((result.dayEnd.getTime() - result.dayStart.getTime()) / 3600000).toBe(hours);
  });
});
