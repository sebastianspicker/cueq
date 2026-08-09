import { describe, it, expect } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EMPLOYEE_USER,
  HR_USER,
  OPEN_PERIOD,
  REVIEW_PERIOD,
  makeHelper,
} from './closing-lifecycle-test-support.js';

describe('ClosingLifecycleHelper', () => {
  describe('reopenClosing', () => {
    it('throws ForbiddenException for EMPLOYEE role', async () => {
      const { helper } = makeHelper({ findUnique: REVIEW_PERIOD });
      await expect(helper.reopenClosing(EMPLOYEE_USER, 'cp-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when period does not exist', async () => {
      const { helper } = makeHelper({ findUnique: null });
      await expect(helper.reopenClosing(HR_USER, 'cp-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException when transition is invalid (OPEN cannot be reopened)', async () => {
      const { helper } = makeHelper({ findUnique: OPEN_PERIOD });
      await expect(helper.reopenClosing(HR_USER, 'cp-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('writes a CLOSING_REOPENED audit entry on success', async () => {
      const { helper, auditHelper } = makeHelper({ findUnique: REVIEW_PERIOD });
      await helper.reopenClosing(HR_USER, 'cp-1');
      expect(auditHelper.appendAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CLOSING_REOPENED' }),
        expect.anything(),
      );
    });

    it('clears approval fields in the audit after snapshot', async () => {
      const { helper, auditHelper } = makeHelper({ findUnique: REVIEW_PERIOD });
      await helper.reopenClosing(HR_USER, 'cp-1');
      const call = auditHelper.appendAudit.mock.calls[0]?.[0];
      expect(call?.after).toMatchObject({ leadApprovedAt: null, hrApprovedAt: null });
    });
  });
});
