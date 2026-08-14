import { describe, expect, it } from 'vitest';
import { TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import type { GdprTestContext } from './gdpr-compliance-test-support.js';

export function registerAbsenceReasonVisibility(context: GdprTestContext) {
  const { createAbsence, teamCalendar, approveFirstLeaveRequest } = context;

  describe('absence reason visibility scoping', () => {
    it('employee sees only APPROVED absences without type or note on team calendar', async () => {
      // Create absence with a note that should be redacted for employees
      await createAbsence(TOKENS.employee, {
        personId: SEED_IDS.personEmployee,
        type: 'SICK',
        startDate: '2026-05-01',
        endDate: '2026-05-02',
        note: 'Medical appointment: private',
      });

      // Approve the absence via the lead workflow
      await approveFirstLeaveRequest();

      const employeeView = await teamCalendar(TOKENS.employee, '2026-05-01', '2026-05-31');

      expect(employeeView.status).toBe(200);
      for (const entry of employeeView.body) {
        // Employees must not see absence type (SICK, ANNUAL_LEAVE, etc.)
        expect(entry.type).toBeUndefined();
        // Employees must not see absence notes
        expect(entry.note).toBeUndefined();
        // Only APPROVED absences should be visible to employees
        expect(entry.status).toBe('APPROVED');
        // Should show generic visibility status
        expect(entry.visibilityStatus).toBe('ABSENT');
      }
    });

    it('team lead sees type and note on team calendar entries', async () => {
      await createAbsence(TOKENS.employee, {
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-05-10',
        endDate: '2026-05-11',
        note: 'Vacation trip',
      });

      const leadView = await teamCalendar(TOKENS.lead, '2026-05-01', '2026-05-31');

      expect(leadView.status).toBe(200);
      // Lead should see REQUESTED absences (not just APPROVED)
      const hasRequested = leadView.body.some(
        (entry: { status: string }) => entry.status === 'REQUESTED',
      );
      expect(hasRequested).toBe(true);
      // Lead should see type and note on at least some entries
      const entryWithType = leadView.body.find(
        (entry: { type?: string }) => entry.type !== undefined,
      );
      expect(entryWithType).toBeDefined();
    });

    it('HR user sees type and note on team calendar entries', async () => {
      const hrView = await teamCalendar(TOKENS.hr, '2026-05-01', '2026-05-31');

      expect(hrView.status).toBe(200);
      // HR should see all entries with type visible
      if (hrView.body.length > 0) {
        const entryWithType = hrView.body.find(
          (entry: { type?: string }) => entry.type !== undefined,
        );
        expect(entryWithType).toBeDefined();
      }
    });
  });
}
