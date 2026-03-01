import { describe, expect, it } from 'vitest';
import { applyCutoffLock, generateClosingChecklist } from '..';

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
    const reopen = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'REOPEN',
      actorRole: 'HR',
      checklistHasErrors: false,
    });
    expect(reopen.nextStatus).toBe('OPEN');

    const reopenAsAdmin = applyCutoffLock({
      currentStatus: 'REVIEW',
      action: 'REOPEN',
      actorRole: 'ADMIN',
      checklistHasErrors: false,
    });
    expect(reopenAsAdmin.nextStatus).toBe('OPEN');

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
});
