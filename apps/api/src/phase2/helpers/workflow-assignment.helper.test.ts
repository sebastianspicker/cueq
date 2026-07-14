import { describe, expect, it, vi } from 'vitest';
import { WorkflowType } from '@cueq/database';
import { WorkflowAssignmentHelper } from './workflow-assignment.helper';

describe('WorkflowAssignmentHelper post-close assignment', () => {
  it('never falls back to the requester when no independent HR/Admin approver exists', async () => {
    const prisma = {
      person: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const helper = new WorkflowAssignmentHelper(prisma as never, {} as never);

    const approver = await (
      helper as unknown as {
        resolveBaseApprover: (input: {
          type: WorkflowType;
          requesterId: string;
          requesterOrganizationUnitId: string;
        }) => Promise<string | null>;
      }
    ).resolveBaseApprover({
      type: WorkflowType.POST_CLOSE_CORRECTION,
      requesterId: 'clrequester000000000000001',
      requesterOrganizationUnitId: 'clorg00000000000000000001',
    });

    expect(approver).toBeNull();
    expect(prisma.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'clrequester000000000000001' } }),
      }),
    );
  });
});
