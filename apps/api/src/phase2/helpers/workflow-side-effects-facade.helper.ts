/** Compatibility implementation for the injectable workflow side-effects provider. */
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from './audit.helper.js';
import { applyBookingCorrectionEffect } from './workflow-effect-booking.js';
import { applyLeaveRequestEffect } from './workflow-effect-leave.js';
import { applyOvertimeEffect } from './workflow-effect-overtime.js';
import { applyShiftSwapEffect } from './workflow-effect-shift-swap.js';
import {
  validatePostCloseSelfApproval,
  validateWorkflowPreApproval,
} from './workflow-effect-validation.js';
import type { WorkflowDecisionResult } from './workflow-utils.js';

export type WorkflowSideEffectsDependencies = { prisma: PrismaService; auditHelper: AuditHelper };

export class WorkflowSideEffectsFacade {
  constructor(private readonly dependencies: WorkflowSideEffectsDependencies) {}

  async validatePreApproval(
    workflowId: string,
    tx?: Pick<PrismaService, 'workflowInstance' | 'shift' | 'person' | 'timeAccount'>,
  ) {
    await validateWorkflowPreApproval(workflowId, tx ?? this.dependencies.prisma);
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
    reason?: string,
    tx?: Pick<
      PrismaService,
      'absence' | 'booking' | 'shift' | 'shiftAssignment' | 'person' | 'timeAccount' | 'auditEntry'
    >,
  ) {
    const db = tx ?? this.dependencies.prisma;
    await applyLeaveRequestEffect(actorId, decision, reason, db, this.dependencies.auditHelper);
    await applyBookingCorrectionEffect(
      actorId,
      decision,
      reason,
      db,
      this.dependencies.auditHelper,
    );
    await applyShiftSwapEffect(
      actorId,
      decision,
      reason,
      this.dependencies.prisma,
      this.dependencies.auditHelper,
      tx,
    );
    await applyOvertimeEffect(actorId, decision, reason, db, this.dependencies.auditHelper);
  }
}
