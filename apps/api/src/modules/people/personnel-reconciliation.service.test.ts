import { reconciliationHash } from './reconciliation-hash.js';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import type { CapabilityHelper } from './capability.helper.js';
import { PersonnelReconciliationService } from './personnel-reconciliation.service.js';

const ids = {
  actor: 'c00000000000000000000101',
  person: 'c00000000000000000000102',
  otherPerson: 'c00000000000000000000103',
  source: 'c00000000000000000000104',
};

type TxOverrides = {
  ownership?: Record<string, 'CUEQ' | 'SOURCE'>;
  existingRecord?: Record<string, unknown> | null;
  field?: Record<string, unknown> | null;
  pending?: Record<string, unknown> | null;
};

function setup(overrides: TxOverrides = {}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ acquired: true, id: ids.person }]),
    hrSourceSystem: {
      findUnique: vi.fn().mockResolvedValue({
        id: ids.source,
        ownershipProfile: overrides.ownership ?? { preferredName: 'SOURCE' },
      }),
    },
    externalHrRecord: {
      findUnique: vi.fn().mockResolvedValue(overrides.existingRecord ?? null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    personnelField: {
      findUnique: vi.fn().mockResolvedValue(overrides.field ?? null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    person: { update: vi.fn().mockResolvedValue({}) },
    profileChangeRequest: {
      findFirst: vi.fn().mockResolvedValue(overrides.pending ?? null),
      update: vi.fn().mockResolvedValue({}),
    },
    personnelChangeOutbox: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  const capabilities = {
    assert: vi.fn().mockResolvedValue(undefined),
  } as unknown as CapabilityHelper;
  const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) } as unknown as AuditHelper;
  return {
    tx,
    capabilities,
    audit,
    service: new PersonnelReconciliationService(prisma, capabilities, audit),
  };
}

function payload(
  fields: Record<string, string>,
  revision = 'rev-1',
  expected: string | null = null,
) {
  return {
    records: [
      {
        personId: ids.person,
        externalRecordId: 'employee-42',
        expectedSourceRevision: expected,
        revision,
        fields,
      },
    ],
  };
}

describe('personnel source reconciliation', () => {
  it('bootstraps an absent source-owned field with immutable source ownership', async () => {
    const context = setup();

    const result = await context.service.reconcile(
      ids.actor,
      ids.source,
      payload({ preferredName: 'Ada' }),
    );

    expect(result).toEqual({
      items: [{ personId: ids.person, status: 'APPLIED', appliedFields: 1, ignoredFields: 0 }],
    });
    expect(context.tx.personnelField.upsert).toHaveBeenCalledWith({
      where: { personId_key: { personId: ids.person, key: 'preferredName' } },
      create: expect.objectContaining({
        personId: ids.person,
        key: 'preferredName',
        value: 'Ada',
        ownerSystemId: ids.source,
        sourceRevision: 'rev-1',
      }),
      update: { value: 'Ada', sourceRevision: 'rev-1', revision: { increment: 1 } },
    });
  });

  it('records but ignores values configured as cueq-owned', async () => {
    const context = setup({ ownership: { preferredName: 'CUEQ' } });

    const result = await context.service.reconcile(
      ids.actor,
      ids.source,
      payload({ preferredName: 'External value' }),
    );

    expect(result.items[0]).toMatchObject({ appliedFields: 0, ignoredFields: 1 });
    expect(context.tx.personnelField.upsert).not.toHaveBeenCalled();
    expect(context.tx.externalHrRecord.upsert).toHaveBeenCalledTimes(1);
  });

  it('acknowledges an externally owned approved change only when the matching value imports', async () => {
    const context = setup({
      existingRecord: {
        personId: ids.person,
        revision: 'rev-1',
        payloadHash: 'old-hash',
      },
      field: { ownerSystemId: ids.source },
      pending: { id: 'request-1', requestedValue: 'Ada', status: 'PENDING_SYNC' },
    });

    await context.service.reconcile(
      ids.actor,
      ids.source,
      payload({ preferredName: 'Ada' }, 'rev-2', 'rev-1'),
    );

    expect(context.tx.profileChangeRequest.update).toHaveBeenCalledWith({
      where: { id: 'request-1' },
      data: { status: 'APPLIED', resolvedAt: expect.any(Date) },
    });
    expect(context.tx.personnelChangeOutbox.update).toHaveBeenCalledWith({
      where: { requestId: 'request-1' },
      data: {
        status: 'APPLIED',
        acknowledgedAt: expect.any(Date),
        acknowledgedRevision: 'rev-2',
      },
    });
  });

  it('treats an identical duplicate source revision as unchanged', async () => {
    const fields = { preferredName: 'Ada' };
    const context = setup({
      existingRecord: {
        personId: ids.person,
        revision: 'rev-1',
        payloadHash: reconciliationHash(fields),
      },
    });

    const result = await context.service.reconcile(
      ids.actor,
      ids.source,
      payload(fields, 'rev-1', null),
    );

    expect(result.items[0]).toMatchObject({ status: 'UNCHANGED', appliedFields: 0 });
    expect(context.tx.personnelField.findUnique).not.toHaveBeenCalled();
    expect(context.tx.externalHrRecord.upsert).not.toHaveBeenCalled();
  });

  it('rejects one source revision reused for different content or a different person', async () => {
    const contentConflict = setup({
      existingRecord: {
        personId: ids.person,
        revision: 'rev-1',
        payloadHash: reconciliationHash({ preferredName: 'Old' }),
      },
    });
    await expect(
      contentConflict.service.reconcile(
        ids.actor,
        ids.source,
        payload({ preferredName: 'New' }, 'rev-1', null),
      ),
    ).rejects.toThrow('cannot describe different content');

    const identityConflict = setup({
      existingRecord: {
        personId: ids.otherPerson,
        revision: 'rev-1',
        payloadHash: reconciliationHash({ preferredName: 'Ada' }),
      },
    });
    await expect(
      identityConflict.service.reconcile(
        ids.actor,
        ids.source,
        payload({ preferredName: 'Ada' }, 'rev-1', null),
      ),
    ).rejects.toThrow('External record identity conflict');
  });

  it('rejects a stale expected source revision before applying fields', async () => {
    const context = setup({
      existingRecord: {
        personId: ids.person,
        revision: 'rev-2',
        payloadHash: 'old-hash',
      },
    });

    await expect(
      context.service.reconcile(
        ids.actor,
        ids.source,
        payload({ preferredName: 'Ada' }, 'rev-3', 'rev-1'),
      ),
    ).rejects.toThrow('Source revision conflict');
    expect(context.tx.personnelField.findUnique).not.toHaveBeenCalled();
  });
});
