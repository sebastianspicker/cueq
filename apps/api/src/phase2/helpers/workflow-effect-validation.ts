import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkflowType } from '@cueq/database';
import { OvertimeApprovalRequestSchema, ShiftSwapRequestSchema } from '@cueq/shared';
import type { PrismaService } from '../../persistence/prisma.service.js';

export async function validateWorkflowPreApproval(
  workflowId: string,
  db: Pick<PrismaService, 'workflowInstance' | 'shift' | 'person' | 'timeAccount'>,
) {
  const workflow = await db.workflowInstance.findUnique({
    where: { id: workflowId },
    select: { id: true, type: true, entityType: true, entityId: true, requestPayload: true },
  });
  if (!workflow) throw new NotFoundException('Workflow not found.');

  if (workflow.type === WorkflowType.SHIFT_SWAP && workflow.entityType === 'Shift') {
    await validateShiftSwapApproval(db, workflow.entityId, workflow.requestPayload);
  }
  if (workflow.type === WorkflowType.OVERTIME_APPROVAL && workflow.entityType === 'TimeAccount') {
    await validateOvertimeApproval(db, workflow.entityId, workflow.requestPayload);
  }
}

async function validateShiftSwapApproval(
  db: Pick<PrismaService, 'shift' | 'person'>,
  entityId: string,
  requestPayload: unknown,
) {
  const request = ShiftSwapRequestSchema.parse(requestPayload ?? {});
  const shift = await db.shift.findUnique({
    where: { id: request.shiftId || entityId },
    include: { assignments: true, roster: { select: { organizationUnitId: true } } },
  });
  if (!shift) throw new NotFoundException('Shift not found for approved swap.');
  const toPerson = await db.person.findUnique({
    where: { id: request.toPersonId },
    select: { id: true, organizationUnitId: true },
  });
  if (!toPerson) throw new NotFoundException('toPersonId person no longer exists.');
  if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
    throw new BadRequestException('toPersonId must belong to the shift roster organization unit.');
  }
  if (!shift.assignments.some((assignment) => assignment.personId === request.fromPersonId)) {
    throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
  }
  if (shift.assignments.some((assignment) => assignment.personId === request.toPersonId)) {
    throw new BadRequestException('toPersonId assignment already exists on shift.');
  }
}

async function validateOvertimeApproval(
  db: Pick<PrismaService, 'timeAccount'>,
  entityId: string,
  requestPayload: unknown,
) {
  const request = OvertimeApprovalRequestSchema.parse(requestPayload ?? {});
  const account = await db.timeAccount.findFirst({
    where: {
      id: entityId,
      personId: request.personId,
      periodStart: { lte: new Date(request.periodStart) },
      periodEnd: { gte: new Date(request.periodEnd) },
    },
    select: { id: true },
    orderBy: { periodStart: 'desc' },
  });
  if (!account) {
    throw new BadRequestException('No matching time account found for overtime approval.');
  }
}

export function validatePostCloseSelfApproval(
  actorId: string,
  workflow: { requesterId: string; type: string },
) {
  if (workflow.type === WorkflowType.POST_CLOSE_CORRECTION && workflow.requesterId === actorId) {
    throw new ForbiddenException('Post-close corrections cannot be self-approved.');
  }
}
