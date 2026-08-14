import { describe, it, expect } from 'vitest';
import {
  ADMIN_USER,
  EMPLOYEE_USER,
  HR_USER,
  OPEN_PERIOD,
  REVIEW_PERIOD,
  TEAM_LEAD_USER,
  makeHelper,
} from './closing-lifecycle-test-support.js';

describe('ClosingLifecycleHelper', () => {
  describe('leadApproveClosing', () => {
    it('rejects every non-team-lead role with the stable message', async () => {
      for (const user of [ADMIN_USER, HR_USER, EMPLOYEE_USER]) {
        const { helper } = makeHelper({ findUnique: REVIEW_PERIOD });
        await expect(helper.leadApproveClosing(user, 'cp-1')).rejects.toThrow(
          'Only TEAM_LEAD can submit lead approval.',
        );
      }
    });

    it('preserves not-found, global, cross-unit, and wrong-status messages', async () => {
      const cases = [
        [null, 'Closing period not found.'],
        [REVIEW_PERIOD, 'Global closing periods do not require team-lead approval.'],
        [
          { ...REVIEW_PERIOD, organizationUnitId: 'ou-2' },
          'Team leads can only approve closing periods in their own unit.',
        ],
        [
          { ...OPEN_PERIOD, organizationUnitId: 'ou-1' },
          'Lead approval is only valid while period is in REVIEW.',
        ],
      ] as const;
      for (const [findUnique, message] of cases) {
        const { helper } = makeHelper({ findUnique });
        await expect(helper.leadApproveClosing(TEAM_LEAD_USER, 'cp-1')).rejects.toThrow(message);
      }
    });

    it('is idempotent for an existing lead approval and does not write again', async () => {
      const approved = {
        ...REVIEW_PERIOD,
        organizationUnitId: 'ou-1',
        leadApprovedAt: new Date('2026-03-01T00:00:00.000Z'),
      };
      const { helper, prisma, auditHelper } = makeHelper({ findUnique: approved });
      await helper.leadApproveClosing(TEAM_LEAD_USER, 'cp-1');
      expect(prisma.closingPeriod.update).not.toHaveBeenCalled();
      expect(auditHelper.appendAudit).not.toHaveBeenCalled();
    });

    it('writes the lead approval and its before/after audit contract', async () => {
      const { helper, prisma, auditHelper } = makeHelper({
        findUnique: { ...REVIEW_PERIOD, organizationUnitId: 'ou-1' },
      });
      await helper.leadApproveClosing(TEAM_LEAD_USER, 'cp-1');
      expect(prisma.closingPeriod.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leadApprovedById: 'person-u-lead' }),
        }),
      );
      expect(auditHelper.appendAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CLOSING_LEAD_APPROVED',
          before: expect.objectContaining({ leadApprovedAt: null }),
          after: expect.objectContaining({ leadApprovedById: 'person-u-lead' }),
        }),
        expect.anything(),
      );
    });
  });
});
