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

@Injectable()
export class WorkflowSchedulingEffectsService implements SchedulingWorkflowEffectsPort {
  constructor(@Inject(AuditHelper) private readonly auditHelper: AuditHelper) {}

  async validateWorkflowPreApproval({ decision, tx }: WorkflowPreApprovalInput) {
    if (decision.type !== WorkflowType.SHIFT_SWAP || decision.entityType !== 'Shift') return;
    const request = ShiftSwapRequestSchema.parse(decision.requestPayload ?? {});
    const shift = await tx.shift.findUnique({
      where: { id: request.shiftId || decision.entityId },
      include: { assignments: true, roster: { select: { organizationUnitId: true } } },
    });
    if (!shift) throw new NotFoundException('Shift not found for approved swap.');
    const toPerson = await tx.person.findUnique({
      where: { id: request.toPersonId },
      select: { id: true, organizationUnitId: true },
    });
    if (!toPerson) throw new NotFoundException('toPersonId person no longer exists.');
    if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException(
        'toPersonId must belong to the shift roster organization unit.',
      );
    }
    if (!shift.assignments.some((assignment) => assignment.personId === request.fromPersonId)) {
      throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
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
    const shift = await tx.shift.findUnique({
      where: { id: request.shiftId || decision.entityId },
      include: { assignments: true, roster: { select: { organizationUnitId: true } } },
    });
    if (!shift) throw new NotFoundException('Shift not found for approved swap.');
    const toPerson = await tx.person.findUnique({
      where: { id: request.toPersonId },
      select: { id: true, organizationUnitId: true },
    });
    if (!toPerson) throw new NotFoundException('toPersonId person no longer exists.');
    if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException(
        'toPersonId must belong to the shift roster organization unit.',
      );
    }
    const fromAssignment = shift.assignments.find(
      (assignment) => assignment.personId === request.fromPersonId,
    );
    if (!fromAssignment) {
      throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
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
      data: { shiftId: shift.id, personId: request.toPersonId },
    });
    await this.auditHelper.appendAudit(
      {
        actorId,
        action: 'SHIFT_SWAP_APPLIED',
        entityType: 'Shift',
        entityId: decision.entityId,
        after: {
          fromPersonId: request.fromPersonId,
          toPersonId: request.toPersonId,
          workflowId: decision.id,
        },
        reason,
      },
      tx,
    );
  }
}
