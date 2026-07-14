import { describe, expect, it, vi } from 'vitest';
import { Role, WorkflowType } from '@cueq/database';
import { WorkflowDelegationCrudHelper } from './workflow-delegation-crud.helper';

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
      'cueq:person-write:cldelegate0000000000000001',
      'cueq:person-write:cldelegator000000000000001',
    ]);
    expect(tx.person.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.workflowDelegationRule.create).toHaveBeenCalledOnce();
  });
});
