import { vi } from 'vitest';
import { ClosingStatus, Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../../common/auth/auth.types.js';
import { ClosingLifecycleHelper } from '../closing-lifecycle.helper.js';

export const ADMIN_USER: AuthenticatedIdentity = {
  subject: 'u-admin',
  email: 'admin@example.com',
  role: Role.ADMIN,
  claims: {},
};
export const HR_USER: AuthenticatedIdentity = {
  subject: 'u-hr',
  email: 'hr@example.com',
  role: Role.HR,
  claims: {},
};
export const TEAM_LEAD_USER: AuthenticatedIdentity = {
  subject: 'u-lead',
  email: 'lead@example.com',
  role: Role.TEAM_LEAD,
  claims: {},
};
export const EMPLOYEE_USER: AuthenticatedIdentity = {
  subject: 'u-emp',
  email: 'emp@example.com',
  role: Role.EMPLOYEE,
  claims: {},
};

export const OPEN_PERIOD = {
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

export const REVIEW_PERIOD = { ...OPEN_PERIOD, status: ClosingStatus.REVIEW };

export const makeHelper = (overrides: {
  findUnique?: unknown;
  checklist?: { hasErrors: boolean };
}) => {
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
