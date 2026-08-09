import { describe, expect, it, vi } from 'vitest';
import { Role, WorkflowType } from '@cueq/database';
import { WorkflowDelegationCrudHelper } from './workflow-delegation-crud.helper.js';

describe('WorkflowDelegationCrudHelper person freshness', () => {
  it('lists the requested delegation subset in its stable routing order', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const helper = new WorkflowDelegationCrudHelper(
      { workflowDelegationRule: { findMany } } as never,
      {} as never,
    );

    await helper.listDelegations({
      delegatorId: 'cldelegator000000000000001',
      workflowType: WorkflowType.LEAVE_REQUEST,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        delegatorId: 'cldelegator000000000000001',
        workflowType: WorkflowType.LEAVE_REQUEST,
      },
      orderBy: [{ delegatorId: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    });
  });

  it('locks the delegator and delegate before validating their live roles and organization units', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'cldelegator000000000000001'
            ? { id: where.id, organizationUnitId: 'clorg00000000000000000001' }
            : {
                id: where.id,
                role: Role.TEAM_LEAD,
                organizationUnitId: 'clorg00000000000000000001',
              },
        ),
      },
      workflowDelegationRule: {
        create: vi.fn().mockResolvedValue({
          id: 'cldelegation0000000000001',
          delegatorId: 'cldelegator000000000000001',
          delegateId: 'cldelegate0000000000000001',
          workflowType: WorkflowType.LEAVE_REQUEST,
        }),
      },
    };
    const helper = new WorkflowDelegationCrudHelper(
      {
        $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
      } as never,
      { appendAudit: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await helper.createDelegation('clactor000000000000000001', {
      delegatorId: 'cldelegator000000000000001',
      delegateId: 'cldelegate0000000000000001',
      workflowType: WorkflowType.LEAVE_REQUEST,
      activeFrom: '2026-07-14T00:00:00.000Z',
    });

    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
      'cueq:person-write:cldelegate0000000000000001',
      'cueq:person-write:cldelegator000000000000001',
    ]);
    expect(tx.person.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.workflowDelegationRule.create).toHaveBeenCalledOnce();
  });

  it('acquires create locks before the first target-validation error', async () => {
    const personId = 'clperson000000000000000001';
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: { findUnique: vi.fn() },
      workflowDelegationRule: { create: vi.fn() },
    };
    const helper = new WorkflowDelegationCrudHelper(
      {
        $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
      } as never,
      { appendAudit: vi.fn() } as never,
    );

    await expect(
      helper.createDelegation('clactor000000000000000001', {
        delegatorId: personId,
        delegateId: personId,
        workflowType: WorkflowType.LEAVE_REQUEST,
        activeFrom: '2026-07-14T00:00:00.000Z',
      }),
    ).rejects.toThrow('Delegator and delegate must be different people.');

    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
      `cueq:person-write:${personId}`,
    ]);
    expect(tx.person.findUnique).not.toHaveBeenCalled();
    expect(tx.workflowDelegationRule.create).not.toHaveBeenCalled();
  });

  it('deletes and audits a delegation from the same routing-locked transaction', async () => {
    const delegation = {
      id: 'cldelegation0000000000001',
      delegatorId: 'cldelegator000000000000001',
      delegateId: 'cldelegate0000000000000001',
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      workflowDelegationRule: {
        findUnique: vi.fn().mockResolvedValue(delegation),
        delete: vi.fn().mockResolvedValue(delegation),
      },
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const prisma = {
      $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const helper = new WorkflowDelegationCrudHelper(prisma as never, auditHelper as never);

    await helper.deleteDelegation('clactor000000000000000001', delegation.id);

    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
    ]);
    expect(tx.workflowDelegationRule.delete).toHaveBeenCalledWith({
      where: { id: delegation.id },
    });
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKFLOW_DELEGATION_DELETED',
        entityId: delegation.id,
      }),
      tx,
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('merges null and undefined update fields differently before writing them', async () => {
    const delegation = {
      id: 'cldelegation0000000000001',
      delegatorId: 'cldelegator000000000000001',
      delegateId: 'cldelegate0000000000000001',
      workflowType: WorkflowType.LEAVE_REQUEST,
      organizationUnitId: 'clorg00000000000000000001',
      activeFrom: new Date('2026-07-14T00:00:00.000Z'),
      activeTo: new Date('2026-07-20T00:00:00.000Z'),
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === delegation.delegatorId
            ? { id: where.id, organizationUnitId: delegation.organizationUnitId }
            : { id: where.id, role: Role.HR, organizationUnitId: delegation.organizationUnitId },
        ),
      },
      workflowDelegationRule: {
        findUnique: vi.fn().mockResolvedValue(delegation),
        update: vi.fn().mockResolvedValue({ ...delegation, activeTo: null }),
      },
    };
    const helper = new WorkflowDelegationCrudHelper(
      {
        $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
      } as never,
      { appendAudit: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await helper.updateDelegation('clactor000000000000000001', delegation.id, {
      activeTo: null,
      workflowType: null,
      organizationUnitId: null,
    });

    expect(tx.workflowDelegationRule.update).toHaveBeenCalledWith({
      where: { id: delegation.id },
      data: expect.objectContaining({
        delegateId: undefined,
        workflowType: null,
        organizationUnitId: null,
        activeFrom: undefined,
        activeTo: null,
      }),
    });
  });

  it('rejects a merged invalid update interval before target validation or mutation', async () => {
    const delegation = {
      id: 'cldelegation0000000000001',
      delegatorId: 'cldelegator000000000000001',
      delegateId: 'cldelegate0000000000000001',
      workflowType: WorkflowType.LEAVE_REQUEST,
      organizationUnitId: 'clorg00000000000000000001',
      activeFrom: new Date('2026-07-14T00:00:00.000Z'),
      activeTo: null,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: { findUnique: vi.fn() },
      workflowDelegationRule: {
        findUnique: vi.fn().mockResolvedValue(delegation),
        update: vi.fn(),
      },
    };
    const helper = new WorkflowDelegationCrudHelper(
      {
        $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
      } as never,
      { appendAudit: vi.fn() } as never,
    );

    await expect(
      helper.updateDelegation('clactor000000000000000001', delegation.id, {
        activeTo: '2026-07-14T00:00:00.000Z',
      }),
    ).rejects.toThrow('activeTo must be after activeFrom.');

    expect(tx.person.findUnique).not.toHaveBeenCalled();
    expect(tx.workflowDelegationRule.update).not.toHaveBeenCalled();
  });

  it('allows HR across units but rejects a non-HR delegate outside the delegated unit', async () => {
    const createWithRole = async (role: Role) => {
      const tx = {
        $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
        person: {
          findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
            where.id === 'cldelegator000000000000001'
              ? { id: where.id, organizationUnitId: 'clorg00000000000000000001' }
              : { id: where.id, role, organizationUnitId: 'clorg00000000000000000002' },
          ),
        },
        workflowDelegationRule: {
          create: vi.fn().mockResolvedValue({
            id: 'cldelegation0000000000001',
            delegatorId: 'cldelegator000000000000001',
            delegateId: 'cldelegate0000000000000001',
            workflowType: WorkflowType.LEAVE_REQUEST,
          }),
        },
      };
      const helper = new WorkflowDelegationCrudHelper(
        {
          $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) =>
            callback(tx),
          ),
        } as never,
        { appendAudit: vi.fn().mockResolvedValue(undefined) } as never,
      );

      return { helper, tx };
    };
    const payload = {
      delegatorId: 'cldelegator000000000000001',
      delegateId: 'cldelegate0000000000000001',
      workflowType: WorkflowType.LEAVE_REQUEST,
      activeFrom: '2026-07-14T00:00:00.000Z',
    };
    const hr = await createWithRole(Role.HR);
    await hr.helper.createDelegation('clactor000000000000000001', payload);
    expect(hr.tx.workflowDelegationRule.create).toHaveBeenCalledOnce();

    const teamLead = await createWithRole(Role.TEAM_LEAD);
    await expect(
      teamLead.helper.createDelegation('clactor000000000000000001', payload),
    ).rejects.toThrow('Non-HR/Admin delegates must belong to the delegated organization unit.');
    expect(teamLead.tx.workflowDelegationRule.create).not.toHaveBeenCalled();
  });

  it('propagates a transaction-scoped audit failure after the write so Prisma can roll it back', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'cldelegator000000000000001'
            ? { id: where.id, organizationUnitId: 'clorg00000000000000000001' }
            : {
                id: where.id,
                role: Role.TEAM_LEAD,
                organizationUnitId: 'clorg00000000000000000001',
              },
        ),
      },
      workflowDelegationRule: {
        create: vi.fn().mockResolvedValue({
          id: 'cldelegation0000000000001',
          delegatorId: 'cldelegator000000000000001',
          delegateId: 'cldelegate0000000000000001',
          workflowType: WorkflowType.LEAVE_REQUEST,
        }),
      },
    };
    const auditFailure = new Error('audit unavailable');
    const auditHelper = { appendAudit: vi.fn().mockRejectedValue(auditFailure) };
    const helper = new WorkflowDelegationCrudHelper(
      {
        $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
      } as never,
      auditHelper as never,
    );

    await expect(
      helper.createDelegation('clactor000000000000000001', {
        delegatorId: 'cldelegator000000000000001',
        delegateId: 'cldelegate0000000000000001',
        workflowType: WorkflowType.LEAVE_REQUEST,
        activeFrom: '2026-07-14T00:00:00.000Z',
      }),
    ).rejects.toThrow(auditFailure);

    expect(tx.workflowDelegationRule.create).toHaveBeenCalledOnce();
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(expect.any(Object), tx);
  });

  it('re-reads a delegation after the routing lock, then locks people before updating and auditing', async () => {
    const delegation = {
      id: 'cldelegation0000000000001',
      delegatorId: 'cldelegator000000000000001',
      delegateId: 'cldelegate0000000000000001',
      workflowType: WorkflowType.LEAVE_REQUEST,
      organizationUnitId: 'clorg00000000000000000001',
      activeFrom: new Date('2026-07-14T00:00:00.000Z'),
      activeTo: null,
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ acquired: true }]),
      person: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === delegation.delegatorId
            ? { id: where.id, organizationUnitId: delegation.organizationUnitId }
            : {
                id: where.id,
                role: Role.TEAM_LEAD,
                organizationUnitId: delegation.organizationUnitId,
              },
        ),
      },
      workflowDelegationRule: {
        findUnique: vi.fn().mockResolvedValue(delegation),
        update: vi.fn().mockResolvedValue(delegation),
      },
    };
    const auditHelper = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const prisma = {
      $transaction: vi.fn(async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const helper = new WorkflowDelegationCrudHelper(prisma as never, auditHelper as never);

    await helper.updateDelegation('clactor000000000000000001', delegation.id, {});

    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:policy-write:workflow-routing',
      'cueq:person-write:cldelegate0000000000000001',
      'cueq:person-write:cldelegator000000000000001',
    ]);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.workflowDelegationRule.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(tx.workflowDelegationRule.findUnique.mock.invocationCallOrder[0]!).toBeLessThan(
      tx.person.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(tx.person.findUnique.mock.invocationCallOrder[1]!).toBeLessThan(
      tx.workflowDelegationRule.update.mock.invocationCallOrder[0]!,
    );
    expect(tx.workflowDelegationRule.update.mock.invocationCallOrder[0]!).toBeLessThan(
      auditHelper.appendAudit.mock.invocationCallOrder[0]!,
    );
    expect(auditHelper.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKFLOW_DELEGATION_UPDATED',
        entityId: delegation.id,
      }),
      tx,
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });
});
