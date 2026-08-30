import { AbsenceStatus, WorkflowType } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type { WorkflowEffectInput } from '../../application/ports/workflow-side-effects.port.js';
import { WorkflowAbsenceEffectsService } from './workflow-absence-effects.service.js';

const ids = {
  actor: 'c00000000000000000000001',
  absence: 'c00000000000000000000002',
  workflow: 'c00000000000000000000003',
};

function input(tx: object, action: WorkflowEffectInput['action'] = 'APPROVE'): WorkflowEffectInput {
  return {
    actorId: ids.actor,
    action,
    decision: {
      id: ids.workflow,
      type: WorkflowType.LEAVE_REQUEST,
      entityType: 'Absence',
      entityId: ids.absence,
      requestPayload: {},
    },
    reason: 'Approved by the responsible lead.',
    tx: tx as WorkflowEffectInput['tx'],
  };
}

describe('WorkflowAbsenceEffectsService', () => {
  it('updates the absence and records its audit entry using the supplied transaction', async () => {
    const audit = { appendAudit: vi.fn().mockResolvedValue(undefined) };
    const tx = {
      absence: {
        findUnique: vi.fn().mockResolvedValue({ status: AbsenceStatus.REQUESTED }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new WorkflowAbsenceEffectsService(audit as never);

    await service.applyWorkflowEffect(input(tx));

    expect(tx.absence.updateMany).toHaveBeenCalledWith({
      where: { id: ids.absence, status: AbsenceStatus.REQUESTED },
      data: { status: AbsenceStatus.APPROVED },
    });
    expect(audit.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ABSENCE_APPROVED',
        before: { status: AbsenceStatus.REQUESTED },
        after: { status: AbsenceStatus.APPROVED },
      }),
      tx,
    );
  });

  it('does not audit a workflow whose guarded mutation no longer applies', async () => {
    const audit = { appendAudit: vi.fn() };
    const tx = {
      absence: {
        findUnique: vi.fn().mockResolvedValue({ status: AbsenceStatus.APPROVED }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const service = new WorkflowAbsenceEffectsService(audit as never);

    await service.applyWorkflowEffect(input(tx, 'REJECT'));

    expect(tx.absence.updateMany).toHaveBeenCalledWith({
      where: { id: ids.absence, status: AbsenceStatus.REQUESTED },
      data: { status: AbsenceStatus.REJECTED },
    });
    expect(audit.appendAudit).not.toHaveBeenCalled();
  });
});
