import { describe, expect, it } from 'vitest';
import { calculateProratedMonthlyTarget } from '../index.js';

describe('calculateProratedMonthlyTarget', () => {
  it('calculates prorated monthly target for segmented work-time model', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [
        { from: '2026-04-01', to: '2026-04-14', weeklyHours: 39.83 },
        { from: '2026-04-15', to: '2026-04-30', weeklyHours: 30 },
      ],
      actualHours: 149,
      transitionAdjustmentHours: -0.33,
    });

    expect(result.proratedTargetHours).toBe(151.33);
    expect(result.deltaHours).toBe(-2.33);
    expect(result.violations).toEqual([]);
  });

  it('supports NRW holiday exclusion when provided', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [{ from: '2026-04-01', to: '2026-04-10', weeklyHours: 39.83 }],
      actualHours: 0,
      holidayDates: ['2026-04-03', '2026-04-06'],
    });

    expect(result.proratedTargetHours).toBe(47.8);
  });

  it('returns validation violations for negative segment values', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [{ from: '2026-04-01', to: '2026-04-10', weeklyHours: -5 }],
      actualHours: 0,
    });

    expect(result.violations[0]?.code).toBe('NEGATIVE_WEEKLY_HOURS');
  });

  it('throws when a segment date is malformed', () => {
    expect(() =>
      calculateProratedMonthlyTarget({
        month: '2026-04',
        segments: [{ from: 'not-a-date', to: '2026-04-10', weeklyHours: 39.83 }],
        actualHours: 0,
      }),
    ).toThrow('Invalid date');
  });

  it('clips segments to the requested month boundaries', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [{ from: '2026-03-20', to: '2026-05-10', weeklyHours: 39.83 }],
      actualHours: 0,
    });

    expect(result.proratedTargetHours).toBe(175.25);
  });

  it('does not double-count overlapping segments inside the same month', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [
        { from: '2026-04-01', to: '2026-04-15', weeklyHours: 39.83 },
        { from: '2026-04-10', to: '2026-04-30', weeklyHours: 20 },
      ],
      actualHours: 0,
    });

    expect(result.proratedTargetHours).toBe(131.63);
  });
});

describe('calculateProratedMonthlyTarget: mid-year start/end', () => {
  it('pro-rates a single segment for an employee starting mid-month', () => {
    // Employee starts July 15: only works the second half of July 2026
    // July 15-31: 13 calendar days. Weekdays: 13 (Jul 15 Wed to Jul 31 Fri)
    // Actually let's count: Jul 15(Wed),16(Thu),17(Fri),20(Mon),21(Tue),22(Wed),23(Thu),24(Fri),27(Mon),28(Tue),29(Wed),30(Thu),31(Fri) = 13 weekdays
    const result = calculateProratedMonthlyTarget({
      month: '2026-07',
      segments: [{ from: '2026-07-15', to: '2026-07-31', weeklyHours: 39.83 }],
      actualHours: 100,
    });

    // 13 weekdays × (39.83/5) = 13 × 7.966 = 103.56
    expect(result.proratedTargetHours).toBe(103.56);
    expect(result.deltaHours).toBe(-3.56);
    expect(result.violations).toEqual([]);
  });

  it('pro-rates for an employee leaving mid-month', () => {
    // Employee leaves March 15, 2026: works only first half of March
    // Mar 2-13 weekdays (Mar 1 is Sunday): Mar 2(Mon)..Mar 13(Fri) = 10 weekdays
    // Plus Mar 16 is Monday, but employee leaves on 15th (Sunday)
    // Mar 1(Sun skip), 2(Mon),3(Tue),4(Wed),5(Thu),6(Fri),9(Mon),10(Tue),11(Wed),12(Thu),13(Fri) = 10 weekdays
    const result = calculateProratedMonthlyTarget({
      month: '2026-03',
      segments: [{ from: '2026-03-02', to: '2026-03-13', weeklyHours: 39.83 }],
      actualHours: 79.66,
    });

    // 10 weekdays × 7.966 = 79.66
    expect(result.proratedTargetHours).toBe(79.66);
    expect(result.deltaHours).toBe(0);
  });

  it('handles transition from one work-time model to another mid-month', () => {
    // Employee changes from 39.83h to 20h on March 16, 2026
    // Segment 1: Mar 2-13 = 10 weekdays at 39.83h/week
    // Segment 2: Mar 16-31 = 12 weekdays at 20h/week
    const result = calculateProratedMonthlyTarget({
      month: '2026-03',
      segments: [
        { from: '2026-03-02', to: '2026-03-13', weeklyHours: 39.83 },
        { from: '2026-03-16', to: '2026-03-31', weeklyHours: 20 },
      ],
      actualHours: 127,
    });

    // Seg1: 10 × 7.966 = 79.66
    // Seg2: 12 × 4.0 = 48.0
    // Total: 127.66
    expect(result.proratedTargetHours).toBe(127.66);
    expect(result.deltaHours).toBe(-0.66);
  });
});

describe('calculateProratedMonthlyTarget: holiday edge cases', () => {
  it('handles segment starting on a holiday', () => {
    // Jan 1 2026 is Neujahr (Thursday). Employee starts Jan 1.
    const result = calculateProratedMonthlyTarget({
      month: '2026-01',
      segments: [{ from: '2026-01-01', to: '2026-01-02', weeklyHours: 39.83 }],
      actualHours: 8,
      holidayDates: ['2026-01-01'],
    });

    // Jan 1 (holiday, excluded), Jan 2 (Fri) = 1 weekday
    // 1 × (39.83/5) = 7.97
    expect(result.proratedTargetHours).toBe(7.97);
  });
});

describe('calculateProratedMonthlyTarget: empty segments', () => {
  it('returns zero target hours for empty segments array', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [],
      actualHours: 0,
    });

    expect(result.proratedTargetHours).toBe(0);
    expect(result.deltaHours).toBe(0);
    expect(result.violations).toEqual([]);
  });

  it('returns zero target with transition adjustment only', () => {
    const result = calculateProratedMonthlyTarget({
      month: '2026-04',
      segments: [],
      actualHours: 5,
      transitionAdjustmentHours: 2.5,
    });

    expect(result.proratedTargetHours).toBe(2.5);
    expect(result.deltaHours).toBe(2.5);
  });
});
