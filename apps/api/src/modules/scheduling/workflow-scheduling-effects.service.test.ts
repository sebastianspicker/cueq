import { BadRequestException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type {
  WorkflowEffectInput,
  WorkflowPreApprovalInput,
} from '../../application/ports/workflow-side-effects.port.js';
import { WorkflowSchedulingEffectsService } from './workflow-scheduling-effects.service.js';

const ids = {
  actor: 'c00000000000000000000001',
  shift: 'c00000000000000000000002',
  fromPerson: 'c00000000000000000000003',
  toPerson: 'c00000000000000000000004',
  assignment: 'c00000000000000000000005',
  workflow: 'c00000000000000000000006',
  unit: 'c00000000000000000000007',
};

function decision(): WorkflowEffectInput['decision'] {
  return {
    id: ids.workflow,
    type: WorkflowType.SHIFT_SWAP,
    entityType: 'Shift',
    entityId: ids.shift,
    requestPayload: {
      shiftId: ids.shift,
      fromPersonId: ids.fromPerson,
      toPersonId: ids.toPerson,
      reason: 'The incoming colleague can cover this scheduled shift.',
    },
  };
}

function shift() {
  return {
    id: ids.shift,
    startTime: new Date('2026-08-21T08:00:00.000Z'),
    endTime: new Date('2026-08-21T16:00:00.000Z'),
    assignments: [{ id: ids.assignment, personId: ids.fromPerson }],
    roster: { organizationUnitId: ids.unit },
  };
}

describe('WorkflowSchedulingEffectsService', () => {
  it('replaces the assignment and audits an approved swap through the supplied transaction', async () => {
    const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const tx = {
      shift: { findUnique: vi.fn().mockResolvedValue(shift()) },
      person: {
        findUnique: vi.fn().mockResolvedValue({ id: ids.toPerson, organizationUnitId: ids.unit }),
      },
      shiftAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
    const service = new WorkflowSchedulingEffectsService(audit as never);

    await service.applyWorkflowEffect({
      actorId: ids.actor,
      action: 'APPROVE',
      decision: decision(),
      reason: 'Swap approved after roster review.',
      tx: tx as unknown as WorkflowEffectInput['tx'],
    });

    expect(tx.shiftAssignment.delete).toHaveBeenCalledWith({ where: { id: ids.assignment } });
    expect(tx.shiftAssignment.create).toHaveBeenCalledWith({
      data: { shiftId: ids.shift, personId: ids.toPerson },
    });
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_SWAP_APPLIED', entityId: ids.shift }),
      tx,
    );
  });

  it('rejects a duplicate target assignment during pre-approval without writes', async () => {
    const tx = {
      shift: {
        findUnique: vi.fn().mockResolvedValue({
          ...shift(),
          assignments: [{ id: ids.assignment, personId: ids.toPerson }],
        }),
      },
      person: {
        findUnique: vi.fn().mockResolvedValue({ id: ids.toPerson, organizationUnitId: ids.unit }),
      },
      shiftAssignment: { delete: vi.fn(), create: vi.fn() },
    };
    const service = new WorkflowSchedulingEffectsService({ appendAudit: vi.fn() } as never);

    await expect(
      service.validateWorkflowPreApproval({
        decision: decision(),
        tx: tx as unknown as WorkflowPreApprovalInput['tx'],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.shiftAssignment.delete).not.toHaveBeenCalled();
    expect(tx.shiftAssignment.create).not.toHaveBeenCalled();
  });
});
