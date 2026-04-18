import { describe, expect, it } from 'vitest';
import { applyCutoffLock, computeExportChecksum, generateClosingChecklist } from '..';

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
  });
});

describe('applyCutoffLock', () => {
  it('enforces open -> review -> approved -> exported path', () => {
    const step1 = applyCutoffLock({
      currentStatus: 'OPEN',
      action: 'ADVANCE_TO_REVIEW',
      actorRole: 'TEAM_LEAD',
      checklistHasErrors: false,
    });
    expect(step1.nextStatus).toBe('REVIEW');

    const step2 = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'APPROVE',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(step2.nextStatus).toBe('APPROVED');

    const step3 = applyCutoffLock({
      currentStatus: 'APPROVED',
      action: 'EXPORT',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(step3.nextStatus).toBe('EXPORTED');
  });

  it('prevents approval when checklist errors remain', () => {
    const result = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'APPROVE',
      actorRole: 'HR',
      checklistHasErrors: true,
    });

    expect(result.nextStatus).toBe('REVIEW');
    expect(result.violations[0]?.code).toBe('CHECKLIST_NOT_GREEN');
  });

  it('allows HR/Admin re-open and post-close correction', () => {
    const reopenFromReview = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'REOPEN',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(reopenFromReview.nextStatus).toBe('OPEN');

    const reopenFromApproved = applyCutoffLock({
      currentStatus: 'APPROVED',
      action: 'REOPEN',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(reopenFromApproved.nextStatus).toBe('OPEN');

    const reopenFromApprovedAsAdmin = applyCutoffLock({
      currentStatus: 'APPROVED',
      action: 'REOPEN',
      actorRole: 'ADMIN',
      checklistHasErrors: false,
    });
    expect(reopenFromApprovedAsAdmin.nextStatus).toBe('OPEN');

    const postClose = applyCutoffLock({
      currentStatus: 'EXPORTED',
      action: 'POST_CLOSE_CORRECTION',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(postClose.nextStatus).toBe('REVIEW');

    const postCloseAsAdmin = applyCutoffLock({
      currentStatus: 'EXPORTED',
      action: 'POST_CLOSE_CORRECTION',
      actorRole: 'ADMIN',
      checklistHasErrors: false,
    });
    expect(postCloseAsAdmin.nextStatus).toBe('REVIEW');
  });

  it('returns deterministic violations for invalid state transitions', () => {
    const invalidReviewAdvance = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'ADVANCE_TO_REVIEW',
      actorRole: 'TEAM_LEAD',
      checklistHasErrors: false,
    });
    expect(invalidReviewAdvance.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');

    const invalidApprove = applyCutoffLock({
      currentStatus: 'OPEN',
      action: 'APPROVE',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(invalidApprove.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');

    const invalidExport = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'EXPORT',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(invalidExport.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');
  });

  it('blocks non-HR/Admin re-open and post-close correction', () => {
    const reopenForbidden = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'REOPEN',
      actorRole: 'TEAM_LEAD',
      checklistHasErrors: false,
    });
    expect(reopenForbidden.violations[0]?.code).toBe('ROLE_FORBIDDEN');

    const postCloseForbidden = applyCutoffLock({
      currentStatus: 'EXPORTED',
      action: 'POST_CLOSE_CORRECTION',
      actorRole: 'TEAM_LEAD',
      checklistHasErrors: false,
    });
    expect(postCloseForbidden.violations[0]?.code).toBe('ROLE_FORBIDDEN');
  });

  it('handles unsupported action values defensively', () => {
    const result = applyCutoffLock({
      currentStatus: 'OPEN',
      action: 'UNKNOWN' as never,
      actorRole: 'HR',
      checklistHasErrors: false,
    });

    expect(result.nextStatus).toBe('OPEN');
    expect(result.violations[0]?.code).toBe('UNSUPPORTED_ACTION');
  });

  it('rejects EXPORTED → OPEN (must go through POST_CLOSE_CORRECTION)', () => {
    // Direct advance-to-review from EXPORTED is not valid
    const advanceFromExported = applyCutoffLock({
      currentStatus: 'EXPORTED',
      action: 'ADVANCE_TO_REVIEW',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(advanceFromExported.nextStatus).toBe('EXPORTED');
    expect(advanceFromExported.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');

    // REOPEN is only valid from REVIEW, not EXPORTED
    const reopenFromExported = applyCutoffLock({
      currentStatus: 'EXPORTED',
      action: 'REOPEN',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(reopenFromExported.nextStatus).toBe('EXPORTED');
    expect(reopenFromExported.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');
  });

  it('verifies each transition guard rejects skipped steps', () => {
    // OPEN → APPROVED (skip REVIEW)
    const skipReview = applyCutoffLock({
      currentStatus: 'OPEN',
      action: 'APPROVE',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(skipReview.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');

    // OPEN → EXPORTED (skip REVIEW + APPROVED)
    const skipToExport = applyCutoffLock({
      currentStatus: 'OPEN',
      action: 'EXPORT',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(skipToExport.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');

    // REVIEW → EXPORTED (skip APPROVED)
    const skipApproval = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'EXPORT',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(skipApproval.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');

    // EXPORTED → OPEN must use post-close correction, not reopen
    const reopenFromApproved = applyCutoffLock({
      currentStatus: 'EXPORTED',
      action: 'REOPEN',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(reopenFromApproved.violations[0]?.code).toBe('INVALID_CLOSING_TRANSITION');
  });

  it('blocks closing with pending workflow approvals via checklist integration', () => {
    // Simulate: open leave requests and open corrections → checklist has errors
    const checklist = generateClosingChecklist({
      missingBookings: 0,
      bookingGaps: 0,
      openCorrectionRequests: 3,
      openLeaveRequests: 2,
      ruleViolations: 0,
      rosterMismatches: 0,
      balanceAnomalies: 0,
    });

    // openCorrectionRequests > 0 with errorByDefault=true → hasErrors=true
    expect(checklist.hasErrors).toBe(true);

    // Feed into transition: approval should be blocked
    const result = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'APPROVE',
      actorRole: 'HR',
      checklistHasErrors: checklist.hasErrors,
    });

    expect(result.nextStatus).toBe('REVIEW');
    expect(result.violations[0]?.code).toBe('CHECKLIST_NOT_GREEN');
  });
});

describe('computeExportChecksum', () => {
  const baseChecklist = generateClosingChecklist({
    missingBookings: 0,
    bookingGaps: 0,
    openCorrectionRequests: 0,
    openLeaveRequests: 0,
    ruleViolations: 0,
    rosterMismatches: 0,
    balanceAnomalies: 0,
  });

  it('produces identical checksum for same period and data', () => {
    const input = {
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data: { employees: ['e1', 'e2'], totalHours: 320 },
    };

    const a = computeExportChecksum(input);
    const b = computeExportChecksum(input);

    expect(a.checksum).toBe(b.checksum);
    expect(a.periodId).toBe('period-2026-03');
    expect(a.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces identical checksum for semantically identical objects with different key order', () => {
    const ordered = computeExportChecksum({
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data: { employees: ['e1', 'e2'], nested: { alpha: 1, beta: 2 }, totalHours: 320 },
    });

    const reordered = computeExportChecksum({
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data: { totalHours: 320, nested: { beta: 2, alpha: 1 }, employees: ['e1', 'e2'] },
    });

    expect(ordered.checksum).toBe(reordered.checksum);
  });

  it('produces different checksum when data changes', () => {
    const inputA = {
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data: { employees: ['e1', 'e2'], totalHours: 320 },
    };

    const inputB = {
      ...inputA,
      data: { employees: ['e1', 'e2'], totalHours: 321 },
    };

    const a = computeExportChecksum(inputA);
    const b = computeExportChecksum(inputB);

    expect(a.checksum).not.toBe(b.checksum);
  });

  it('produces different checksum for different periods with same data', () => {
    const data = { employees: ['e1'], totalHours: 160 };

    const march = computeExportChecksum({
      periodId: 'period-2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist: baseChecklist,
      data,
    });

    const april = computeExportChecksum({
      periodId: 'period-2026-04',
      periodStart: '2026-04-01',
      periodEnd: '2026-04-30',
      checklist: baseChecklist,
      data,
    });

    expect(march.checksum).not.toBe(april.checksum);
  });
});
