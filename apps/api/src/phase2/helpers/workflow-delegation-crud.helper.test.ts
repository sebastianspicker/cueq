import { describe, expect, it, vi } from 'vitest';
import { Role, WorkflowType } from '@cueq/database';
import { WorkflowDelegationCrudHelper } from './workflow-delegation-crud.helper.js';

describe('WorkflowDelegationCrudHelper person freshness', () => {
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
