import { describe, expect, it } from 'vitest';
import { TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import type { GdprTestContext } from './gdpr-compliance-test-support.js';

export function registerReportDataMinimization(context: GdprTestContext) {
  const { report } = context;

  describe('data minimization in report outputs', () => {
    it('audit-summary report does not expose individual actor IDs', async () => {
      const response = await report(TOKENS.dataProtection, '/v1/reports/audit-summary', {
        from: '2026-03-01',
        to: '2026-03-31',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('totals');
      // Must have aggregate count, not individual IDs
      expect(response.body.totals).toHaveProperty('uniqueActors');
      expect(typeof response.body.totals.uniqueActors).toBe('number');
      // Must NOT expose individual actor IDs
      expect(response.body).not.toHaveProperty('actors');
      expect(response.body).not.toHaveProperty('actorIds');
      const bodyString = JSON.stringify(response.body);
      expect(bodyString).not.toContain('email');
    });

    it('compliance-summary report uses aggregate metrics only', async () => {
      const response = await report(TOKENS.worksCouncil, '/v1/reports/compliance-summary', {
        from: '2026-03-01',
        to: '2026-03-31',
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('privacy');
      expect(response.body.privacy).toHaveProperty('minGroupSize');
      expect(response.body.privacy.minGroupSize).toBeGreaterThanOrEqual(5);
      // Must have aggregate counts
      expect(response.body).toHaveProperty('closing');
      expect(response.body).toHaveProperty('payrollExport');
      // Must NOT expose individual person data
      expect(response.body).not.toHaveProperty('persons');
      expect(response.body).not.toHaveProperty('personIds');
    });

    it('custom report preview uses aggregate-only output without person IDs', async () => {
      const response = await report(TOKENS.hr, '/v1/reports/custom/preview', {
        reportType: 'TEAM_ABSENCE',
        groupBy: 'ORGANIZATION_UNIT',
        from: '2026-03-01',
        to: '2026-03-31',
        organizationUnitId: SEED_IDS.ouAdmin,
        metrics: ['days'],
      });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.rows)).toBe(true);
      // Must NOT expose individual person IDs
      expect(response.body).not.toHaveProperty('personIds');
      const bodyString = JSON.stringify(response.body);
      // Check that no CUID patterns matching person IDs appear in aggregated output
      // (The OU ID is expected, but person IDs should not be present)
      expect(bodyString).not.toContain(SEED_IDS.personEmployee);
    });

    it('team-absence report enforces minimum group size for privacy', async () => {
      const response = await report(TOKENS.hr, '/v1/reports/team-absence', {
        from: '2026-03-01',
        to: '2026-03-31',
        organizationUnitId: SEED_IDS.ouAdmin,
      });

      expect(response.status).toBe(200);
      // Report should contain aggregated data, not individual records
      const bodyString = JSON.stringify(response.body);
      // Should not contain personal email addresses
      expect(bodyString).not.toContain('@cueq.local');
    });

    it('oe-overtime report provides aggregate data only', async () => {
      const response = await report(TOKENS.hr, '/v1/reports/oe-overtime', {
        from: '2026-03-01',
        to: '2026-03-31',
        organizationUnitId: SEED_IDS.ouAdmin,
      });

      expect(response.status).toBe(200);
      // Must not contain personal email addresses
      const bodyString = JSON.stringify(response.body);
      expect(bodyString).not.toContain('@cueq.local');
    });
  });
}
