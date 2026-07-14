import { Role } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import { OncallDomainService } from './oncall-domain.service';

const PERSON_ID = 'cm0000000000000000000001';
const ACTOR_ID = 'cm0000000000000000000002';
const ORGANIZATION_UNIT_ID = 'cm0000000000000000000003';

const user = {
  subject: ACTOR_ID,
  email: 'hr@example.invalid',
  role: Role.HR,
  claims: {},
};

function fixture() {
  const existing = {
    id: 'rotation-1',
    personId: PERSON_ID,
    organizationUnitId: ORGANIZATION_UNIT_ID,
    startTime: new Date('2026-07-14T08:00:00.000Z'),
    endTime: new Date('2026-07-14T16:00:00.000Z'),
    rotationType: 'DAILY',
    note: null,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
    person: {
      findUnique: vi.fn().mockResolvedValue({
        id: PERSON_ID,
        organizationUnitId: ORGANIZATION_UNIT_ID,
      }),
    },
    onCallRotation: {
      findUnique: vi.fn().mockResolvedValue(existing),
      create: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue({
        ...existing,
        endTime: new Date('2026-07-14T17:00:00.000Z'),
      }),
    },
    auditEntry: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    onCallRotation: { findUnique: vi.fn().mockResolvedValue(existing) },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const personHelper = { personForUser: vi.fn().mockResolvedValue({ id: ACTOR_ID }) };
  const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
  const closingLockHelper = {};
  const service = new OncallDomainService(
    prisma as never,
    personHelper as never,
    auditHelper as never,
    closingLockHelper as never,
  );

  return { service, prisma, tx, auditHelper };
}

describe('OncallDomainService rotation atomicity', () => {
  it('creates a rotation and its audit in the same person-serialized transaction', async () => {
    const { service, prisma, tx, auditHelper } = fixture();

    await service.createOnCallRotation(user, {
      personId: PERSON_ID,
      organizationUnitId: ORGANIZATION_UNIT_ID,
      startTime: '2026-07-14T08:00:00.000Z',
      endTime: '2026-07-14T16:00:00.000Z',
      rotationType: 'DAILY',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.onCallRotation.create).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('re-reads a rotation after locking and atomically records the update audit', async () => {
    const { service, tx, auditHelper } = fixture();

    await service.updateOnCallRotation(user, 'rotation-1', {
      endTime: '2026-07-14T17:00:00.000Z',
    });

    expect(tx.onCallRotation.findUnique).toHaveBeenCalledWith({ where: { id: 'rotation-1' } });
    expect(tx.onCallRotation.update).toHaveBeenCalledTimes(1);
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('does not report rotation creation success when the audit participant fails', async () => {
    const { service, auditHelper } = fixture();
    auditHelper.appendAudit.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      service.createOnCallRotation(user, {
        personId: PERSON_ID,
        organizationUnitId: ORGANIZATION_UNIT_ID,
        startTime: '2026-07-14T08:00:00.000Z',
        endTime: '2026-07-14T16:00:00.000Z',
        rotationType: 'DAILY',
      }),
    ).rejects.toThrow('audit unavailable');
  });
});
