import { describe, it, expect } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EMPLOYEE_USER,
  HR_USER,
  REVIEW_PERIOD,
  makeHelper,
} from './closing-lifecycle-test-support.js';

describe('ClosingLifecycleHelper', () => {
  describe('approveClosing', () => {
    it('throws ForbiddenException for EMPLOYEE role', async () => {
      const { helper } = makeHelper({ findUnique: REVIEW_PERIOD });
      await expect(helper.approveClosing(EMPLOYEE_USER, 'cp-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when period does not exist', async () => {
      const { helper } = makeHelper({ findUnique: null });
      await expect(helper.approveClosing(HR_USER, 'cp-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when org unit lacks lead approval', async () => {
      const { helper } = makeHelper({
        findUnique: { ...REVIEW_PERIOD, organizationUnitId: 'ou-1', leadApprovedAt: null },
      });
      await expect(helper.approveClosing(HR_USER, 'cp-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when checklist has errors', async () => {
      const { helper } = makeHelper({
        findUnique: REVIEW_PERIOD,
        checklist: { hasErrors: true },
      });
      await expect(helper.approveClosing(HR_USER, 'cp-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('emits a closing.completed domain event on success', async () => {
      const { helper, eventOutboxHelper } = makeHelper({ findUnique: REVIEW_PERIOD });
      await helper.approveClosing(HR_USER, 'cp-1');
      expect(eventOutboxHelper.enqueueDomainEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'closing.completed' }),
        expect.anything(),
      );
    });

    it('writes a CLOSING_APPROVED audit entry on success', async () => {
      const { helper, auditHelper } = makeHelper({ findUnique: REVIEW_PERIOD });
      await helper.approveClosing(HR_USER, 'cp-1');
      expect(auditHelper.appendAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CLOSING_APPROVED' }),
        expect.anything(),
      );
    });
  });
});
