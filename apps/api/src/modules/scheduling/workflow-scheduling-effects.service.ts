/** Owns roster-assignment mutations caused by approved workflow decisions. */
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';
import { ShiftSwapRequestSchema } from '@cueq/contracts';
import type {
  SchedulingWorkflowEffectsPort,
  WorkflowEffectInput,
  WorkflowPreApprovalInput,
} from '../../application/ports/workflow-side-effects.port.js';
import { AuditHelper } from '../audit/public.js';
import { AssignmentHelper } from '../people/public.js';

@Injectable()
export class WorkflowSchedulingEffectsService implements SchedulingWorkflowEffectsPort {
  constructor(
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(AssignmentHelper) private readonly assignmentHelper: AssignmentHelper,
  ) {}

  async validateWorkflowPreApproval({ decision, tx }: WorkflowPreApprovalInput) {
    if (decision.type !== WorkflowType.SHIFT_SWAP || decision.entityType !== 'Shift') return;
    const request = ShiftSwapRequestSchema.parse(decision.requestPayload ?? {});
    if (
      !decision.assignmentId ||
      (request.assignmentId && request.assignmentId !== decision.assignmentId)
    ) {
      throw new BadRequestException('Shift-swap appointment does not match its workflow.');
    }
    const shift = await tx.shift.findUnique({
      where: { id: request.shiftId || decision.entityId },
      include: { assignments: true, roster: { select: { organizationUnitId: true } } },
    });
    if (!shift) throw new NotFoundException('Shift not found for approved swap.');
    const fromAssignment = shift.assignments.find(
      (assignment) => assignment.personId === request.fromPersonId,
    );
    if (!fromAssignment || fromAssignment.assignmentId !== decision.assignmentId) {
      throw new BadRequestException('fromPersonId appointment no longer exists on shift.');
    }
    const targetEmployment = await this.assignmentHelper.resolveInterval(
      request.toPersonId,
      shift.startTime,
      shift.endTime,
      request.toAssignmentId,
      tx,
    );
    if (targetEmployment.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException(
        'toPersonId must belong to the shift roster organization unit.',
      );
    }
    if (shift.assignments.some((assignment) => assignment.personId === request.toPersonId)) {
      throw new BadRequestException('toPersonId assignment already exists on shift.');
    }
  }

  async applyWorkflowEffect({ actorId, action, decision, reason, tx }: WorkflowEffectInput) {
    if (
      decision.type !== WorkflowType.SHIFT_SWAP ||
      decision.entityType !== 'Shift' ||
      action !== 'APPROVE'
    ) {
      return;
    }
    const request = ShiftSwapRequestSchema.parse(decision.requestPayload ?? {});
    if (
      !decision.assignmentId ||
      (request.assignmentId && request.assignmentId !== decision.assignmentId)
    ) {
      throw new BadRequestException('Shift-swap appointment does not match its workflow.');
    }
    const shift = await tx.shift.findUnique({
      where: { id: request.shiftId || decision.entityId },
      include: { assignments: true, roster: { select: { organizationUnitId: true } } },
    });
    if (!shift) throw new NotFoundException('Shift not found for approved swap.');
    const fromAssignment = shift.assignments.find(
      (assignment) => assignment.personId === request.fromPersonId,
    );
    if (!fromAssignment || fromAssignment.assignmentId !== decision.assignmentId) {
      throw new BadRequestException('fromPersonId appointment no longer exists on shift.');
    }
    const targetEmployment = await this.assignmentHelper.resolveInterval(
      request.toPersonId,
      shift.startTime,
      shift.endTime,
      request.toAssignmentId,
      tx,
    );
    if (targetEmployment.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException(
        'toPersonId appointment must belong to the shift roster organization unit.',
      );
    }
    if (shift.assignments.some((assignment) => assignment.personId === request.toPersonId)) {
      throw new BadRequestException('toPersonId assignment already exists on shift.');
    }
    const overlap = await tx.shiftAssignment.findFirst({
      where: {
        personId: request.toPersonId,
        shift: {
          id: { not: shift.id },
          startTime: { lt: shift.endTime },
          endTime: { gt: shift.startTime },
        },
      },
      select: { id: true },
    });
    if (overlap) throw new BadRequestException('toPersonId has an overlapping assigned shift.');

    await tx.shiftAssignment.delete({ where: { id: fromAssignment.id } });
    await tx.shiftAssignment.create({
      data: {
        shiftId: shift.id,
        personId: request.toPersonId,
        assignmentId: targetEmployment.assignment.id,
      },
    });
    await this.auditHelper.appendAudit(
      {
        actorId,
        action: 'SHIFT_SWAP_APPLIED',
        entityType: 'Shift',
        entityId: decision.entityId,
        after: {
          fromPersonId: request.fromPersonId,
          fromAssignmentId: fromAssignment.assignmentId,
          toPersonId: request.toPersonId,
          toAssignmentId: targetEmployment.assignment.id,
          workflowId: decision.id,
        },
        reason,
      },
      tx,
    );
  }
}
