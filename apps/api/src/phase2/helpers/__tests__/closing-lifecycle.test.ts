import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClosingStatus, ClosingLockSource, Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../../common/auth/auth.types';
import { ClosingLifecycleHelper } from '../closing-lifecycle.helper';

const ADMIN_USER: AuthenticatedIdentity = {
  subject: 'u-admin',
  email: 'admin@example.com',
  role: Role.ADMIN,
  claims: {},
};
const HR_USER: AuthenticatedIdentity = {
  subject: 'u-hr',
  email: 'hr@example.com',
  role: Role.HR,
  claims: {},
};
const TEAM_LEAD_USER: AuthenticatedIdentity = {
  subject: 'u-lead',
  email: 'lead@example.com',
  role: Role.TEAM_LEAD,
  claims: {},
};
const EMPLOYEE_USER: AuthenticatedIdentity = {
  subject: 'u-emp',
  email: 'emp@example.com',
  role: Role.EMPLOYEE,
  claims: {},
};

const OPEN_PERIOD = {
  id: 'cp-1',
  status: ClosingStatus.OPEN,
  organizationUnitId: null,
  leadApprovedAt: null,
  leadApprovedById: null,
  hrApprovedAt: null,
  hrApprovedById: null,
  lockedAt: null,
  lockSource: null,
  closedAt: null,
  closedById: null,
};

const REVIEW_PERIOD = { ...OPEN_PERIOD, status: ClosingStatus.REVIEW };

const makeHelper = (overrides: { findUnique?: unknown; checklist?: { hasErrors: boolean } }) => {
  const updated = { ...OPEN_PERIOD };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    closingPeriod: {
      findUnique: vi.fn().mockResolvedValue(overrides.findUnique ?? null),
      update: vi
        .fn()
        .mockImplementation((args: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...updated, ...args.data }),
        ),
    },
  };
  Object.assign(prisma, {
    $transaction: vi.fn(async (callback: (tx: typeof prisma) => unknown) => callback(prisma)),
  });
  const personHelper = {
    personForUser: vi.fn().mockImplementation((user: AuthenticatedIdentity) =>
      Promise.resolve({
        id: `person-${user.subject}`,
        role: user.role,
        organizationUnitId: user.role === Role.TEAM_LEAD ? 'ou-1' : null,
      }),
    ),
  };
  const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const eventOutboxHelper = { enqueueDomainEvent: vi.fn().mockResolvedValue(undefined) };
  const checklistHelper = {
    closingChecklist: vi.fn().mockResolvedValue(overrides.checklist ?? { hasErrors: false }),
  };

  const helper = new ClosingLifecycleHelper(
    prisma as never,
    personHelper as never,
    auditHelper as never,
    eventOutboxHelper as never,
    checklistHelper as never,
  );

  return { helper, prisma, auditHelper, eventOutboxHelper };
};

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
