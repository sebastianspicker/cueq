import { describe, expect, it } from 'vitest';
import { applyCutoffLock, computeExportChecksum, generateClosingChecklist } from './index.js';

const greenChecklistInput = {
  missingBookings: 0,
  bookingGaps: 0,
  openCorrectionRequests: 0,
  openLeaveRequests: 0,
  ruleViolations: 0,
  rosterMismatches: 0,
  balanceAnomalies: 0,
};

describe('monthly closing rules through the public domain API', () => {
  it('reports a resolved, information-only checklist when every check is clear', () => {
    const checklist = generateClosingChecklist(greenChecklistInput);

    expect(checklist.hasErrors).toBe(false);
    expect(checklist.items).toHaveLength(7);
    expect(checklist.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_BOOKINGS', severity: 'INFO', status: 'RESOLVED' }),
        expect.objectContaining({
          code: 'RULE_VIOLATIONS',
          details: '0 unresolved policy violations',
        }),
      ]),
    );
  });

  it('classifies default-error checks differently from warnings and pluralizes details', () => {
    const checklist = generateClosingChecklist({
      ...greenChecklistInput,
      missingBookings: 1,
      bookingGaps: 2,
      openCorrectionRequests: 1,
      openLeaveRequests: 1,
      ruleViolations: 1,
      rosterMismatches: 1,
      balanceAnomalies: 1,
    });

    expect(checklist.hasErrors).toBe(true);
    expect(checklist.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_BOOKINGS', severity: 'ERROR', status: 'OPEN' }),
        expect.objectContaining({ code: 'OPEN_CORRECTIONS', severity: 'ERROR' }),
        expect.objectContaining({ code: 'BOOKING_GAPS', severity: 'WARNING' }),
        expect.objectContaining({
          code: 'RULE_VIOLATIONS',
          details: '1 unresolved policy violation',
        }),
      ]),
    );
  });

  it('hashes semantically equal object payloads identically while retaining array order', () => {
    const checklist = generateClosingChecklist(greenChecklistInput);
    const base = {
      periodId: '2026-03',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      checklist,
    };

    const ordered = computeExportChecksum({
      ...base,
      data: { person: { id: 'p-1', name: 'Ada' }, rows: [1, 2] },
    });
    const reorderedKeys = computeExportChecksum({
      ...base,
      data: { rows: [1, 2], person: { name: 'Ada', id: 'p-1' } },
    });
    const reorderedRows = computeExportChecksum({
      ...base,
      data: { person: { id: 'p-1', name: 'Ada' }, rows: [2, 1] },
    });

    expect(ordered.periodId).toBe('2026-03');
    expect(ordered.checksum).toMatch(/^[a-f0-9]{64}$/u);
    expect(reorderedKeys.checksum).toBe(ordered.checksum);
    expect(reorderedRows.checksum).not.toBe(ordered.checksum);
  });

  it.each([
    [
      'advances an open period to review',
      'OPEN',
      'ADVANCE_TO_REVIEW',
      'EMPLOYEE',
      false,
      'REVIEW',
      undefined,
    ],
    [
      'blocks approval with checklist errors',
      'REVIEW',
      'APPROVE',
      'HR',
      true,
      'REVIEW',
      'CHECKLIST_NOT_GREEN',
    ],
    ['approves a green review', 'REVIEW', 'APPROVE', 'HR', false, 'APPROVED', undefined],
    ['exports an approved period', 'APPROVED', 'EXPORT', 'ADMIN', false, 'EXPORTED', undefined],
    [
      'rejects export from review',
      'REVIEW',
      'EXPORT',
      'ADMIN',
      false,
      'REVIEW',
      'INVALID_CLOSING_TRANSITION',
    ],
    [
      'requires HR to reopen',
      'APPROVED',
      'REOPEN',
      'TEAM_LEAD',
      false,
      'APPROVED',
      'ROLE_FORBIDDEN',
    ],
    ['allows admin to reopen', 'APPROVED', 'REOPEN', 'ADMIN', false, 'OPEN', undefined],
    [
      'requires HR-like roles for post-close corrections',
      'EXPORTED',
      'POST_CLOSE_CORRECTION',
      'EMPLOYEE',
      false,
      'EXPORTED',
      'ROLE_FORBIDDEN',
    ],
    [
      'returns exported corrections to review for HR',
      'EXPORTED',
      'POST_CLOSE_CORRECTION',
      'HR',
      false,
      'REVIEW',
      undefined,
    ],
  ] as const)(
    '%s',
    (_name, currentStatus, action, actorRole, checklistHasErrors, nextStatus, violationCode) => {
      const result = applyCutoffLock({ currentStatus, action, actorRole, checklistHasErrors });

      expect(result.nextStatus).toBe(nextStatus);
      expect(result.violations.map((violation) => violation.code)).toEqual(
        violationCode ? [violationCode] : [],
      );
    },
  );

  it('rejects an unrecognized runtime action without changing state', () => {
    const result = applyCutoffLock({
      currentStatus: 'OPEN',
      action: 'ARCHIVE' as never,
      actorRole: 'ADMIN',
      checklistHasErrors: false,
    });

    expect(result.nextStatus).toBe('OPEN');
    expect(result.violations[0]?.code).toBe('UNSUPPORTED_ACTION');
  });
});
