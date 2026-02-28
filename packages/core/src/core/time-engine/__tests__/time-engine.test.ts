import { describe, expect, it } from 'vitest';
import { calculateFlextimeWeek, evaluateOnCallRestCompliance } from '..';

describe('calculateFlextimeWeek', () => {
  it('detects break deficits', () => {
    const result = calculateFlextimeWeek({
      week: '2026-W10',
      targetHours: 39.83,
      bookings: [{ day: '2026-03-03', workedHours: 8, breakMinutes: 15 }],
    });

    expect(result.violations.some((violation) => violation.code === 'BREAK_DEFICIT')).toBe(true);
  });

  it('detects rest deficits', () => {
    const result = calculateFlextimeWeek({
      week: '2026-W10',
      targetHours: 39.83,
      bookings: [{ day: '2026-03-03', workedHours: 8 }],
      dailyRestHours: [10],
    });

    expect(result.violations.some((violation) => violation.code === 'REST_HOURS_DEFICIT')).toBe(
      true,
    );
  });

  it('detects max daily and weekly breaches', () => {
    const result = calculateFlextimeWeek({
      week: '2026-W10',
      targetHours: 39.83,
      bookings: [
        { day: '2026-03-02', workedHours: 12 },
        { day: '2026-03-03', workedHours: 12 },
        { day: '2026-03-04', workedHours: 12 },
        { day: '2026-03-05', workedHours: 12 },
        { day: '2026-03-06', workedHours: 12 },
      ],
    });

    expect(
      result.violations.some((violation) => violation.code === 'MAX_DAILY_HOURS_EXCEEDED'),
    ).toBe(true);
    expect(
      result.violations.some((violation) => violation.code === 'MAX_WEEKLY_HOURS_EXCEEDED'),
    ).toBe(true);
  });

  it('reports plausibility issues for overlap, missing end, and negative durations', () => {
    const result = calculateFlextimeWeek({
      week: '2026-W10',
      targetHours: 39.83,
      bookings: [{ day: '2026-03-02', workedHours: 8 }],
      bookingIntervals: [
        {
          start: '2026-03-02T08:00:00.000Z',
          end: '2026-03-02T10:00:00.000Z',
        },
        {
          start: '2026-03-02T09:30:00.000Z',
          end: '2026-03-02T11:00:00.000Z',
        },
        {
          start: '2026-03-02T12:00:00.000Z',
        },
        {
          start: '2026-03-02T14:00:00.000Z',
          end: '2026-03-02T13:00:00.000Z',
        },
      ],
    });

    expect(result.plausibilityIssues.some((issue) => issue.code === 'OVERLAP')).toBe(true);
    expect(result.plausibilityIssues.some((issue) => issue.code === 'MISSING_END')).toBe(true);
    expect(result.plausibilityIssues.some((issue) => issue.code === 'NEGATIVE_DURATION')).toBe(
      true,
    );
  });

  it('emits warning when daily hours exceed standard max but not extended limit', () => {
    const result = calculateFlextimeWeek({
      week: '2026-W10',
      targetHours: 39.83,
      bookings: [{ day: '2026-03-02', workedHours: 9 }],
    });

    expect(
      result.warnings.some((warning) => warning.code === 'MAX_DAILY_HOURS_EXTENDED_RANGE'),
    ).toBe(true);
  });
});

describe('evaluateOnCallRestCompliance', () => {
  it('marks deployment as non-compliant when rest is below minimum', () => {
    const result = evaluateOnCallRestCompliance({
      rotationStart: '2026-03-12T16:00:00.000Z',
      rotationEnd: '2026-03-19T08:00:00.000Z',
      deployments: [
        {
          start: '2026-03-14T01:10:00.000Z',
          end: '2026-03-14T02:20:00.000Z',
        },
      ],
      nextShiftStart: '2026-03-14T10:00:00.000Z',
    });

    expect(result.compliant).toBe(false);
    expect(result.violations.some((violation) => violation.code === 'ONCALL_REST_DEFICIT')).toBe(
      true,
    );
  });

  it('returns compliant result when no deployments exist', () => {
    const result = evaluateOnCallRestCompliance({
      rotationStart: '2026-03-12T16:00:00.000Z',
      rotationEnd: '2026-03-19T08:00:00.000Z',
      deployments: [],
      nextShiftStart: '2026-03-14T10:00:00.000Z',
    });

    expect(result.compliant).toBe(true);
    expect(result.violations).toEqual([]);
  });
});
