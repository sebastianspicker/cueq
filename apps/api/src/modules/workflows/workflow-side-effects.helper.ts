/** Injectable provider for final workflow decision side effects. */
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import {
  ABSENCE_WORKFLOW_EFFECTS_PORT,
  ATTENDANCE_WORKFLOW_EFFECTS_PORT,
  SCHEDULING_WORKFLOW_EFFECTS_PORT,
  type AbsenceWorkflowEffectsPort,
  type AttendanceWorkflowEffectsPort,
  type SchedulingWorkflowEffectsPort,
} from '../../application/ports/workflow-side-effects.port.js';
import { validatePostCloseSelfApproval } from './workflow-effect-validation.js';
import type { WorkflowDecisionResult } from './workflow-contracts.js';

@Injectable()
export class WorkflowSideEffectsHelper {
  constructor(
    @Inject(ABSENCE_WORKFLOW_EFFECTS_PORT)
    private readonly absenceEffects: AbsenceWorkflowEffectsPort,
    @Inject(ATTENDANCE_WORKFLOW_EFFECTS_PORT)
    private readonly attendanceEffects: AttendanceWorkflowEffectsPort,
    @Inject(SCHEDULING_WORKFLOW_EFFECTS_PORT)
    private readonly schedulingEffects: SchedulingWorkflowEffectsPort,
  ) {}

  async validatePreApproval(workflowId: string, tx: Prisma.TransactionClient) {
    const workflow = await tx.workflowInstance.findUnique({
      where: { id: workflowId },
      select: { id: true, type: true, entityType: true, entityId: true, requestPayload: true },
    });
    if (!workflow) throw new NotFoundException('Workflow not found.');
    await this.schedulingEffects.validateWorkflowPreApproval({ decision: workflow, tx });
    await this.attendanceEffects.validateWorkflowPreApproval({ decision: workflow, tx });
  }

  async validatePostCloseSelfApproval(
    actorId: string,
    workflow: { requesterId: string; type: string },
    _reason?: string,
  ) {
    validatePostCloseSelfApproval(actorId, workflow);
  }

  async applyDecisionSideEffects(
    actorId: string,
    decision: WorkflowDecisionResult,
    tx: Parameters<AbsenceWorkflowEffectsPort['applyWorkflowEffect']>[0]['tx'],
    reason?: string,
  ) {
    const input = { actorId, action: decision.action, decision: decision.updated, reason, tx };
    await this.absenceEffects.applyWorkflowEffect(input);
    await this.attendanceEffects.applyWorkflowEffect(input);
    await this.schedulingEffects.applyWorkflowEffect(input);
  }
}
