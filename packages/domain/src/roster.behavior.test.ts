import { describe, expect, it } from 'vitest';
import {
  advanceRosterStatus,
  comparePlanVsActual,
  detectShiftOverlaps,
  evaluateMinStaffing,
  evaluatePlanVsActualCoverage,
  evaluateShiftCompliance,
} from './index.js';

describe('roster planning calculations through the public domain API', () => {
  it.each([
    { slots: [], expected: { totalSlots: 0, mismatchedSlots: 0, complianceRate: 1 } },
    {
      slots: [
        { slotId: 'morning', plannedHeadcount: 2, actualHeadcount: 2 },
        { slotId: 'late', plannedHeadcount: 1, actualHeadcount: 0 },
        { slotId: 'night', plannedHeadcount: 1, actualHeadcount: 2 },
      ],
      expected: { totalSlots: 3, mismatchedSlots: 2, complianceRate: 0.33 },
    },
  ])('compares planned and actual slot headcount', ({ slots, expected }) => {
    expect(comparePlanVsActual(slots)).toEqual(expected);
  });

  it('counts each covered worker once, merges adjacent bookings, and ignores non-work categories', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'day',
          startTime: '2026-03-02T08:00:00.000Z',
          endTime: '2026-03-02T12:00:00.000Z',
          shiftType: 'DAY',
          minStaffing: 1,
          assignedPersonIds: ['ada', 'ada'],
        },
        {
          shiftId: 'late',
          startTime: '2026-03-02T12:00:00.000Z',
          endTime: '2026-03-02T16:00:00.000Z',
          shiftType: 'LATE',
          minStaffing: 2,
          assignedPersonIds: ['bea'],
        },
      ],
      [
        {
          personId: 'ada',
          startTime: '2026-03-02T08:00:00.000Z',
          endTime: '2026-03-02T10:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
        {
          personId: 'ada',
          startTime: '2026-03-02T10:00:00.000Z',
          endTime: '2026-03-02T12:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
        {
          personId: 'ada',
          startTime: '2026-03-02T08:30:00.000Z',
          endTime: '2026-03-02T11:30:00.000Z',
          timeTypeCategory: 'PAUSE',
        },
        {
          personId: 'bea',
          startTime: '2026-03-02T12:00:00.000Z',
          endTime: '2026-03-02T16:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
        {
          personId: 'cy',
          startTime: '2026-03-02T14:00:00.000Z',
          endTime: '2026-03-02T16:00:00.000Z',
          timeTypeCategory: 'DEPLOYMENT',
        },
      ],
    );

    expect(result).toMatchObject({
      totalSlots: 2,
      mismatchedSlots: 0,
      complianceRate: 1,
      understaffedSlots: 0,
      coverageRate: 1,
      durationCoverageRate: 0.83,
    });
    expect(result.slots).toEqual([
      expect.objectContaining({
        shiftId: 'day',
        assignedHeadcount: 1,
        plannedHeadcount: 1,
        actualHeadcount: 1,
        actualCoveredMinutes: 240,
        durationCoverageRatio: 1,
        compliant: true,
      }),
      expect.objectContaining({
        shiftId: 'late',
        assignedHeadcount: 1,
        plannedHeadcount: 2,
        actualHeadcount: 2,
        actualCoveredMinutes: 360,
        durationCoverageRatio: 0.75,
        compliant: true,
      }),
    ]);
  });

  it('excludes short or non-overlapping bookings and reports understaffing', () => {
    const result = evaluatePlanVsActualCoverage(
      [
        {
          shiftId: 'short',
          startTime: '2026-03-03T08:00:00.000Z',
          endTime: '2026-03-03T10:00:00.000Z',
          shiftType: 'DAY',
          minStaffing: 2,
          assignedPersonIds: [],
        },
      ],
      [
        {
          personId: 'ada',
          startTime: '2026-03-03T08:00:00.000Z',
          endTime: '2026-03-03T08:45:00.000Z',
          timeTypeCategory: 'WORK',
        },
        {
          personId: 'bea',
          startTime: '2026-03-03T06:00:00.000Z',
          endTime: '2026-03-03T08:00:00.000Z',
          timeTypeCategory: 'WORK',
        },
      ],
      { coverageThreshold: 0.5 },
    );

    expect(result).toMatchObject({
      mismatchedSlots: 1,
      understaffedSlots: 1,
      coverageRate: 0,
      durationCoverageRate: 0,
    });
    expect(result.slots[0]).toMatchObject({ actualHeadcount: 0, delta: -2, compliant: false });
    expect(evaluatePlanVsActualCoverage([], [])).toMatchObject({ coverageRate: 1, slots: [] });
  });
});

describe('roster compliance and status invariants', () => {
  it.each([
    {
      name: 'accepts a valid shift with a sufficient recorded break and rest',
      input: {
        shift: { type: 'DAY', start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T16:00:00.000Z' },
        recordedBreakMinutes: 30,
        previousShiftEnd: '2026-03-01T18:00:00.000Z',
      },
      expected: { workedHours: 7.5, requiredBreakMinutes: 30, violationCodes: [] },
    },
    {
      name: 'reports independent break and rest deficits',
      input: {
        shift: { type: 'DAY', start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T18:00:00.000Z' },
        recordedBreakMinutes: 15,
        previousShiftEnd: '2026-03-02T00:00:00.000Z',
      },
      expected: {
        workedHours: 9.75,
        requiredBreakMinutes: 45,
        violationCodes: ['BREAK_DEFICIT', 'REST_HOURS_DEFICIT'],
      },
    },
    {
      name: 'rejects non-positive intervals',
      input: {
        shift: { type: 'DAY', start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T08:00:00.000Z' },
        recordedBreakMinutes: 0,
      },
      expected: {
        workedHours: 0,
        requiredBreakMinutes: 0,
        violationCodes: ['INVALID_SHIFT_INTERVAL'],
      },
    },
  ])('$name', ({ input, expected }) => {
    const result = evaluateShiftCompliance(input);
    expect({
      workedHours: result.workedHours,
      requiredBreakMinutes: result.requiredBreakMinutes,
      violationCodes: result.violations.map((violation) => violation.code),
    }).toEqual(expected);
  });

  it.each([
    [
      { requiredMinStaffing: 2, assignedCount: 2 },
      { compliant: true, shortfall: 0 },
    ],
    [
      { requiredMinStaffing: 2, assignedCount: 1 },
      { compliant: false, shortfall: 1 },
    ],
  ])('calculates staffing shortfall', (input, expected) => {
    expect(evaluateMinStaffing(input)).toEqual(expected);
  });

  it('returns overlap issues only for people whose shifts overlap', () => {
    const overlaps = detectShiftOverlaps([
      { personCode: 'ada', start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
      { personCode: 'ada', start: '2026-03-02T11:00:00.000Z', end: '2026-03-02T14:00:00.000Z' },
      { personCode: 'bea', start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
      { personCode: 'bea', start: '2026-03-02T12:00:00.000Z', end: '2026-03-02T14:00:00.000Z' },
    ]);

    expect(overlaps).toEqual([
      expect.objectContaining({
        personCode: 'ada',
        issues: [expect.objectContaining({ code: 'OVERLAP' })],
      }),
    ]);
  });

  it.each([
    ['DRAFT', 'PUBLISH', false, 'PUBLISHED', undefined],
    ['DRAFT', 'PUBLISH', true, 'DRAFT', 'CHECKLIST_NOT_GREEN'],
    ['PUBLISHED', 'PUBLISH', false, 'PUBLISHED', 'INVALID_TRANSITION'],
    ['PUBLISHED', 'CLOSE', false, 'CLOSED', undefined],
    ['DRAFT', 'CLOSE', false, 'DRAFT', 'INVALID_TRANSITION'],
    ['PUBLISHED', 'REVERT_TO_DRAFT', false, 'DRAFT', undefined],
    ['CLOSED', 'REVERT_TO_DRAFT', false, 'CLOSED', 'INVALID_TRANSITION'],
  ] as const)(
    'transitions roster status',
    (currentStatus, action, checklistHasErrors, nextStatus, violationCode) => {
      const result = advanceRosterStatus({ currentStatus, action, checklistHasErrors });
      expect(result.nextStatus).toBe(nextStatus);
      expect(result.violations.map((violation) => violation.code)).toEqual(
        violationCode ? [violationCode] : [],
      );
    },
  );
});
