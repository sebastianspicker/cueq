import { describe, expect, it } from 'vitest';
import { TOKENS } from '../test-helpers.js';
import type { GdprTestContext } from './gdpr-compliance-test-support.js';

export function registerReportAccessAudit(context: GdprTestContext) {
  const { report, reportAccessCount } = context;

  describe('report access generates audit trail entries', () => {
    it('accessing audit-summary logs a REPORT_ACCESSED audit entry', async () => {
      const countBefore = await reportAccessCount();

      await report(TOKENS.dataProtection, '/v1/reports/audit-summary', {
        from: '2026-03-01',
        to: '2026-03-31',
      });

      const countAfter = await reportAccessCount();

      expect(countAfter).toBeGreaterThan(countBefore);
    });

    it('accessing compliance-summary logs a REPORT_ACCESSED audit entry', async () => {
      const countBefore = await reportAccessCount();

      await report(TOKENS.worksCouncil, '/v1/reports/compliance-summary', {
        from: '2026-03-01',
        to: '2026-03-31',
      });

      const countAfter = await reportAccessCount();

      expect(countAfter).toBeGreaterThan(countBefore);
    });
  });
}
