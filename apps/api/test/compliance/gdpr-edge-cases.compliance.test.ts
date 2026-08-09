import { afterAll, beforeAll, describe } from 'vitest';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { createGdprTestContext, type GdprTestContext } from './gdpr-compliance-test-support.js';
import { registerAbsenceReasonVisibility } from './gdpr-compliance-absence.js';
import { registerAuditTrailImmutability } from './gdpr-compliance-audit.js';
import { registerAbsenceDataMinimization } from './gdpr-compliance-absence-minimization.js';
import { registerReportDataMinimization } from './gdpr-compliance-report-minimization.js';
import { registerReportAccessAudit } from './gdpr-compliance-report-access.js';

/**
 * P6.2 GDPR compliance edge-case tests:
 *  - Absence reason visibility scoping by role
 *  - Audit trail immutability (attempted update/delete via Prisma)
 *  - Data minimization in report outputs
 */
describe('GDPR compliance edge cases (P6.2)', () => {
  const context: GdprTestContext = createGdprTestContext();

  beforeAll(async () => {
    seedPhase2Data();
    context.app = await createTestApp();
  });

  afterAll(async () => {
    if (context.app) {
      await context.app.close();
    }
  });

  /* ── Absence Reason Visibility ─────────────────────────────── */
  registerAbsenceReasonVisibility(context);

  /* ── Audit Trail Immutability ──────────────────────────────── */
  registerAuditTrailImmutability(context);

  /* ── Data Minimization: Own vs. Others' Absence Data ──────── */
  registerAbsenceDataMinimization(context);

  /* ── Data Minimization in Report Outputs ────────────────────── */
  registerReportDataMinimization(context);

  /* ── Report Access Audit Logging ───────────────────────────── */
  registerReportAccessAudit(context);
});
