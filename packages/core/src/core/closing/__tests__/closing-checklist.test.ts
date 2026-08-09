import { describe, expect, it } from 'vitest';
import { generateClosingChecklist } from '../index.js';

describe('generateClosingChecklist', () => {
  it('marks checklist severities and unresolved errors', () => {
    const checklist = generateClosingChecklist({
      missingBookings: 1,
      bookingGaps: 1,
      openCorrectionRequests: 0,
      openLeaveRequests: 0,
      ruleViolations: 2,
      rosterMismatches: 0,
      balanceAnomalies: 0,
    });

    expect(checklist.items.find((item) => item.code === 'MISSING_BOOKINGS')?.severity).toBe(
      'ERROR',
    );
    expect(checklist.items.find((item) => item.code === 'BOOKING_GAPS')?.severity).toBe('WARNING');
    expect(checklist.hasErrors).toBe(true);
  });

  it('classifies mixed states: resolved items are INFO, open items reflect severity tier', () => {
    const checklist = generateClosingChecklist({
      missingBookings: 0,
      bookingGaps: 3,
      openCorrectionRequests: 2,
      openLeaveRequests: 1,
      ruleViolations: 0,
      rosterMismatches: 4,
      balanceAnomalies: 0,
    });

    // Resolved items (count === 0) are INFO + RESOLVED
    const missing = checklist.items.find((i) => i.code === 'MISSING_BOOKINGS');
    expect(missing?.severity).toBe('INFO');
    expect(missing?.status).toBe('RESOLVED');

    const rules = checklist.items.find((i) => i.code === 'RULE_VIOLATIONS');
    expect(rules?.severity).toBe('INFO');
    expect(rules?.status).toBe('RESOLVED');

    // errorByDefault items with count > 0 are ERROR + OPEN
    const corrections = checklist.items.find((i) => i.code === 'OPEN_CORRECTIONS');
    expect(corrections?.severity).toBe('ERROR');
    expect(corrections?.status).toBe('OPEN');

    // non-errorByDefault items with count > 0 are WARNING + OPEN
    const gaps = checklist.items.find((i) => i.code === 'BOOKING_GAPS');
    expect(gaps?.severity).toBe('WARNING');
    expect(gaps?.status).toBe('OPEN');

    const leave = checklist.items.find((i) => i.code === 'OPEN_LEAVE');
    expect(leave?.severity).toBe('WARNING');
    expect(leave?.status).toBe('OPEN');

    const roster = checklist.items.find((i) => i.code === 'ROSTER_MISMATCHES');
    expect(roster?.severity).toBe('WARNING');
    expect(roster?.status).toBe('OPEN');

    // hasErrors = true because OPEN_CORRECTIONS is ERROR + OPEN
    expect(checklist.hasErrors).toBe(true);
  });

  it('reports no errors when all error-by-default items are resolved', () => {
    const checklist = generateClosingChecklist({
      missingBookings: 0,
      bookingGaps: 5,
      openCorrectionRequests: 0,
      openLeaveRequests: 3,
      ruleViolations: 0,
      rosterMismatches: 2,
      balanceAnomalies: 1,
    });

    // WARNING items are open but do not trigger hasErrors
    expect(checklist.hasErrors).toBe(false);
    expect(checklist.items.filter((i) => i.status === 'OPEN')).toHaveLength(4);
    expect(checklist.items.filter((i) => i.severity === 'WARNING')).toHaveLength(4);
  });

  it('generates deterministic output for identical inputs', () => {
    const input = {
      missingBookings: 2,
      bookingGaps: 1,
      openCorrectionRequests: 0,
      openLeaveRequests: 3,
      ruleViolations: 1,
      rosterMismatches: 0,
      balanceAnomalies: 0,
    };

    const a = generateClosingChecklist(input);
    const b = generateClosingChecklist(input);

    expect(a).toEqual(b);
    expect(a.items.find((item) => item.code === 'RULE_VIOLATIONS')?.details).toBe(
      '1 unresolved policy violation',
    );
  });
});
