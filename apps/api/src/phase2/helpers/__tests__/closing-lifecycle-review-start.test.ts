import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClosingLockSource } from '@cueq/database';
import {
  ADMIN_USER,
  HR_USER,
  OPEN_PERIOD,
  REVIEW_PERIOD,
  makeHelper,
} from './closing-lifecycle-test-support.js';

describe('ClosingLifecycleHelper', () => {
  describe('startClosingReview', () => {
    beforeEach(() => {
      process.env['CLOSING_ALLOW_MANUAL_REVIEW_START'] = 'true';
    });

    afterEach(() => {
      delete process.env['CLOSING_ALLOW_MANUAL_REVIEW_START'];
    });

    it('throws ForbiddenException for non-ADMIN roles', async () => {
      const { helper } = makeHelper({ findUnique: OPEN_PERIOD });
      await expect(helper.startClosingReview(HR_USER, 'cp-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when period does not exist', async () => {
      const { helper } = makeHelper({ findUnique: null });
      await expect(helper.startClosingReview(ADMIN_USER, 'cp-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequestException when transition is invalid (already in REVIEW)', async () => {
      const { helper } = makeHelper({ findUnique: REVIEW_PERIOD });
      await expect(helper.startClosingReview(ADMIN_USER, 'cp-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('writes an audit entry on success', async () => {
      const { helper, auditHelper } = makeHelper({ findUnique: OPEN_PERIOD });
      await helper.startClosingReview(ADMIN_USER, 'cp-1');
      expect(auditHelper.appendAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CLOSING_REVIEW_STARTED', entityType: 'ClosingPeriod' }),
        expect.anything(),
      );
    });

    it('returns a result with lockSource set', async () => {
      const { helper } = makeHelper({ findUnique: OPEN_PERIOD });
      const result = await helper.startClosingReview(ADMIN_USER, 'cp-1');
      expect((result as Record<string, unknown>)['lockSource']).toBe(
        ClosingLockSource.MANUAL_REVIEW_START,
      );
    });

    it('throws ForbiddenException when feature flag is disabled', async () => {
      delete process.env['CLOSING_ALLOW_MANUAL_REVIEW_START'];
      const { helper } = makeHelper({ findUnique: OPEN_PERIOD });
      await expect(helper.startClosingReview(ADMIN_USER, 'cp-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
