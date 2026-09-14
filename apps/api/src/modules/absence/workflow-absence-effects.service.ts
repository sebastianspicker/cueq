/** Owns absence mutations caused by an approved workflow. */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { AbsenceStatus, WorkflowType } from '@cueq/database';
import type {
  AbsenceWorkflowEffectsPort,
  WorkflowEffectInput,
} from '../../application/ports/workflow-side-effects.port.js';
import { AuditHelper } from '../audit/public.js';

function nextAbsenceStatus(action: WorkflowEffectInput['action']): AbsenceStatus | null {
  const statuses: Partial<Record<WorkflowEffectInput['action'], AbsenceStatus>> = {
    APPROVE: AbsenceStatus.APPROVED,
    REJECT: AbsenceStatus.REJECTED,
    CANCEL: AbsenceStatus.CANCELLED,
  };
  return statuses[action] ?? null;
}

function mutableAbsenceStatus(nextStatus: AbsenceStatus) {
  return nextStatus === AbsenceStatus.CANCELLED
    ? { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] }
    : AbsenceStatus.REQUESTED;
}

function absenceAuditAction(nextStatus: AbsenceStatus) {
  if (nextStatus === AbsenceStatus.APPROVED) return 'ABSENCE_APPROVED';
  if (nextStatus === AbsenceStatus.REJECTED) return 'ABSENCE_REJECTED';
  return 'ABSENCE_CANCELLED';
}

@Injectable()
export class WorkflowAbsenceEffectsService implements AbsenceWorkflowEffectsPort {
  constructor(@Inject(AuditHelper) private readonly auditHelper: AuditHelper) {}

  async applyWorkflowEffect({ actorId, action, decision, reason, tx }: WorkflowEffectInput) {
    if (decision.type !== WorkflowType.LEAVE_REQUEST || decision.entityType !== 'Absence') return;

    const nextStatus = nextAbsenceStatus(action);
    if (!nextStatus) return;

    const current = await tx.absence.findUnique({
      where: { id: decision.entityId },
      select: { status: true, assignmentId: true },
    });
    if (!current) return;
    if (!decision.assignmentId || decision.assignmentId !== current.assignmentId) {
      throw new BadRequestException('Absence appointment does not match its workflow.');
    }
    const result = await tx.absence.updateMany({
      where: {
        id: decision.entityId,
        assignmentId: decision.assignmentId,
        status: mutableAbsenceStatus(nextStatus),
      },
      data: { status: nextStatus },
    });
    if (result.count === 0) return;

    await this.auditHelper.appendAudit(
      {
        actorId,
        action: absenceAuditAction(nextStatus),
        entityType: 'Absence',
        entityId: decision.entityId,
        before: { status: current?.status ?? null },
        after: { status: nextStatus },
        reason,
      },
      tx,
    );
  }
}
