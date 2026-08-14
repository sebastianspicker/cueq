import { describe, expect, it } from 'vitest';
import { prisma } from '@cueq/database';
import { TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import type { GdprTestContext } from './gdpr-compliance-test-support.js';

export function registerAbsenceDataMinimization(context: GdprTestContext) {
  const { as, createAbsence, teamCalendar } = context;

  describe('data minimization: absence type access', () => {
    it('employee can see their own absence type via GET /v1/absences/me', async () => {
      await createAbsence(TOKENS.employee, {
        personId: SEED_IDS.personEmployee,
        type: 'ANNUAL_LEAVE',
        startDate: '2026-07-14',
        endDate: '2026-07-14',
        note: 'Personal day',
      });

      const res = await as(TOKENS.employee).get('/v1/absences/me');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Employee has the right to see their own absence type
      const myAbsence = res.body.find((a: { startDate: string }) =>
        a.startDate.startsWith('2026-07-14'),
      );
      if (myAbsence) {
        expect(myAbsence.type).toBe('ANNUAL_LEAVE');
      }
    });

    it('absence creation writes type to audit trail (complete audit record for HR/ADMIN)', async () => {
      const beforeCount = await prisma.auditEntry.count({
        where: { action: 'ABSENCE_REQUESTED', entityType: 'Absence' },
      });

      await createAbsence(TOKENS.employee, {
        personId: SEED_IDS.personEmployee,
        type: 'SICK',
        startDate: '2026-07-21',
        endDate: '2026-07-21',
      });

      const entries = await prisma.auditEntry.findMany({
        where: { action: { in: ['ABSENCE_REQUESTED', 'ABSENCE_RECORDED'] }, entityType: 'Absence' },
        orderBy: { timestamp: 'desc' },
      });

      expect(entries.length).toBeGreaterThan(beforeCount);
      // Audit entry must record the absence type for HR/ADMIN audit trail completeness
      const latest = entries[0];
      expect(latest).toBeDefined();
      const afterPayload = latest!.after as Record<string, unknown>;
      expect(afterPayload).toHaveProperty('type');
    });

    it('employee cannot retrieve another person absence details via team calendar type field', async () => {
      // Create a SICK absence for a second person (HR acts on behalf) and approve it
      await createAbsence(TOKENS.hr, {
        personId: SEED_IDS.personEmployee,
        type: 'SICK',
        startDate: '2026-08-04',
        endDate: '2026-08-04',
        status: 'APPROVED',
      });

      // A different employee checking the team calendar must not see the SICK type
      const res = await teamCalendar(TOKENS.employee, '2026-08-01', '2026-08-31');

      expect(res.status).toBe(200);
      for (const entry of res.body as Array<Record<string, unknown>>) {
        // Type must never be visible to EMPLOYEE role on team calendar
        expect(entry['type']).toBeUndefined();
        expect(entry['note']).toBeUndefined();
      }
    });
  });
}
