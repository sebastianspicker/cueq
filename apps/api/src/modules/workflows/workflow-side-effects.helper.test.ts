import { WorkflowType } from '@cueq/database';
import { describe, expect, it, vi } from 'vitest';
import type {
  AbsenceWorkflowEffectsPort,
  AttendanceWorkflowEffectsPort,
  SchedulingWorkflowEffectsPort,
  WorkflowEffectInput,
} from '../../application/ports/workflow-side-effects.port.js';
import { WorkflowSideEffectsHelper } from './workflow-side-effects.helper.js';

const decision: WorkflowEffectInput['decision'] = {
  id: 'c00000000000000000000001',
  type: WorkflowType.LEAVE_REQUEST,
  entityType: 'Absence',
  entityId: 'c00000000000000000000002',
  requestPayload: {},
};

describe('WorkflowSideEffectsHelper', () => {
  it('delegates every decision to the owner ports with the original transaction', async () => {
    const absence = { applyWorkflowEffect: vi.fn().mockResolvedValue(undefined) };
    const attendance = {
      applyWorkflowEffect: vi.fn().mockResolvedValue(undefined),
      validateWorkflowPreApproval: vi.fn().mockResolvedValue(undefined),
    };
    const scheduling = {
      applyWorkflowEffect: vi.fn().mockResolvedValue(undefined),
      validateWorkflowPreApproval: vi.fn().mockResolvedValue(undefined),
    };
    const tx = {};
    const helper = new WorkflowSideEffectsHelper(
      absence as AbsenceWorkflowEffectsPort,
      attendance as AttendanceWorkflowEffectsPort,
      scheduling as SchedulingWorkflowEffectsPort,
    );

    await helper.applyDecisionSideEffects(
      'c00000000000000000000003',
      { action: 'APPROVE', previous: {} as never, updated: decision as never },
      tx as never,
      'Approved by the designated approver.',
    );

    const expectedInput = expect.objectContaining({
      actorId: 'c00000000000000000000003',
      action: 'APPROVE',
      decision,
      reason: 'Approved by the designated approver.',
      tx,
    });
    expect(absence.applyWorkflowEffect).toHaveBeenCalledWith(expectedInput);
    expect(attendance.applyWorkflowEffect).toHaveBeenCalledWith(expectedInput);
    expect(scheduling.applyWorkflowEffect).toHaveBeenCalledWith(expectedInput);
  });

  it('runs only pre-approval ports after loading the workflow in the supplied transaction', async () => {
    const absence = { applyWorkflowEffect: vi.fn() };
    const attendance = {
      applyWorkflowEffect: vi.fn(),
      validateWorkflowPreApproval: vi.fn().mockResolvedValue(undefined),
    };
    const scheduling = {
      applyWorkflowEffect: vi.fn(),
      validateWorkflowPreApproval: vi.fn().mockResolvedValue(undefined),
    };
    const tx = { workflowInstance: { findUnique: vi.fn().mockResolvedValue(decision) } };
    const helper = new WorkflowSideEffectsHelper(
      absence as AbsenceWorkflowEffectsPort,
      attendance as AttendanceWorkflowEffectsPort,
      scheduling as SchedulingWorkflowEffectsPort,
    );

    await helper.validatePreApproval(decision.id, tx as never);

    expect(tx.workflowInstance.findUnique).toHaveBeenCalledWith({
      where: { id: decision.id },
      select: { id: true, type: true, entityType: true, entityId: true, requestPayload: true },
    });
    expect(scheduling.validateWorkflowPreApproval).toHaveBeenCalledWith({ decision, tx });
    expect(attendance.validateWorkflowPreApproval).toHaveBeenCalledWith({ decision, tx });
    expect(absence.applyWorkflowEffect).not.toHaveBeenCalled();
  });
});
