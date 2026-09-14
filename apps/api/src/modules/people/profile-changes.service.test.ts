import { profileReviewStatus } from './profile-review-status.js';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import { ProfileChangesService } from './profile-changes.service.js';

const ids = {
  actor: 'c00000000000000000000201',
  person: 'c00000000000000000000202',
  source: 'c00000000000000000000203',
  otherSource: 'c00000000000000000000204',
  request: 'c00000000000000000000205',
};

function reviewSetup(input: {
  ownerSystemId: string | null;
  expectedRevision: number;
  field: { revision: number; ownerSystemId: string | null } | null;
}) {
  const request = {
    id: ids.request,
    personId: ids.person,
    fieldKey: 'preferredName',
    requestedValue: 'Ada',
    expectedRevision: input.expectedRevision,
    ownerSystemId: input.ownerSystemId,
    status: 'PENDING_APPROVAL',
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true, id: ids.person }]),
    profileChangeRequest: {
      findUnique: vi.fn().mockResolvedValue({ personId: ids.person }),
      findUniqueOrThrow: vi.fn().mockResolvedValue(request),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...request,
        ...data,
      })),
    },
    personnelField: {
      findUnique: vi.fn().mockResolvedValue(input.field),
      upsert: vi.fn().mockResolvedValue({}),
    },
    person: { update: vi.fn().mockResolvedValue({}) },
    personnelChangeOutbox: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) } as unknown as AuditHelper;
  return { tx, audit, service: new ProfileChangesService(prisma, audit) };
}

describe('profile change approval', () => {
  it('applies a cueq-owned field and request state in the same transaction', async () => {
    const context = reviewSetup({ ownerSystemId: null, expectedRevision: 0, field: null });

    const result = await context.service.review(ids.actor, ids.request, {
      decision: 'APPROVE',
      reason: 'Verified native profile change',
    });

    expect(result).toMatchObject({ status: 'APPLIED', reviewerId: ids.actor });
    expect(context.tx.profileChangeRequest.update).toHaveBeenCalledWith({
      where: { id: ids.request },
      data: expect.objectContaining({ status: 'APPLIED', reviewerId: ids.actor }),
    });
    expect(context.tx.personnelField.upsert).toHaveBeenCalledWith({
      where: { personId_key: { personId: ids.person, key: 'preferredName' } },
      create: {
        personId: ids.person,
        key: 'preferredName',
        value: 'Ada',
      },
      update: { value: 'Ada', revision: { increment: 1 } },
    });
    expect(context.tx.personnelChangeOutbox.create).not.toHaveBeenCalled();
    expect(context.audit.appendAudit).toHaveBeenCalledWith(expect.any(Object), context.tx);
  });

  it('queues an externally owned approval without changing the local field', async () => {
    const context = reviewSetup({
      ownerSystemId: ids.source,
      expectedRevision: 3,
      field: { revision: 3, ownerSystemId: ids.source },
    });

    const result = await context.service.review(ids.actor, ids.request, {
      decision: 'APPROVE',
      reason: 'Forward to authoritative source',
    });

    expect(result).toMatchObject({ status: 'PENDING_SYNC' });
    expect(context.tx.personnelField.upsert).not.toHaveBeenCalled();
    expect(context.tx.personnelChangeOutbox.create).toHaveBeenCalledWith({
      data: { requestId: ids.request, sourceSystemId: ids.source },
    });
  });

  it('forbids self-approval before loading or mutating the full request', async () => {
    const context = reviewSetup({ ownerSystemId: null, expectedRevision: 0, field: null });

    await expect(
      context.service.review(ids.person, ids.request, {
        decision: 'APPROVE',
        reason: 'Self approval attempt',
      }),
    ).rejects.toThrow('requires another authorized reviewer');

    expect(context.tx.profileChangeRequest.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(context.tx.profileChangeRequest.update).not.toHaveBeenCalled();
    expect(context.audit.appendAudit).not.toHaveBeenCalled();
  });

  it('persists a conflict without applying or forwarding a stale approval', async () => {
    const context = reviewSetup({
      ownerSystemId: ids.source,
      expectedRevision: 3,
      field: { revision: 4, ownerSystemId: ids.otherSource },
    });

    const result = await context.service.review(ids.actor, ids.request, {
      decision: 'APPROVE',
      reason: 'Review against stale ownership',
    });

    expect(result).toMatchObject({ status: 'CONFLICT' });
    expect(context.tx.profileChangeRequest.update).toHaveBeenCalledWith({
      where: { id: ids.request },
      data: expect.objectContaining({
        status: 'CONFLICT',
        resolvedAt: expect.any(Date),
      }),
    });
    expect(context.tx.personnelField.upsert).not.toHaveBeenCalled();
    expect(context.tx.personnelChangeOutbox.create).not.toHaveBeenCalled();
  });

  it('marks stale revisions and ownership changes as conflicts', () => {
    expect(
      profileReviewStatus('APPROVE', { expectedRevision: 2, ownerSystemId: ids.source }, {
        revision: 3,
        ownerSystemId: ids.source,
      } as never),
    ).toBe('CONFLICT');
    expect(
      profileReviewStatus('APPROVE', { expectedRevision: 2, ownerSystemId: ids.source }, {
        revision: 2,
        ownerSystemId: ids.otherSource,
      } as never),
    ).toBe('CONFLICT');
  });
});
