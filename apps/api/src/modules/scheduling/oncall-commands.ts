import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CreateOnCallDeploymentSchema,
  CreateOnCallRotationSchema,
  UpdateOnCallRotationSchema,
} from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import type { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import { APPROVAL_ROLES, type AssignmentHelper, type PersonHelper } from '../people/public.js';
import { createOnCallDeployment } from './oncall-deployment.js';
import {
  assertCanCreateOnCallRotationInOrganization,
  createOnCallRotationMutation,
  updateOnCallRotationMutation,
} from './oncall-rotation-mutations.js';

type OnCallCommandDependencies = {
  prisma: PrismaService;
  personHelper: PersonHelper;
  assignmentHelper: AssignmentHelper;
  auditHelper: AuditHelper;
  closingLockHelper: ClosingLockHelper;
};

export async function createOnCallRotationCommand(
  dependencies: OnCallCommandDependencies,
  user: AuthenticatedIdentity,
  payload: unknown,
) {
  const actor = await dependencies.personHelper.personForUser(user);
  if (!APPROVAL_ROLES.has(user.role)) {
    throw new ForbiddenException('Only approval-capable roles can manage on-call rotations.');
  }
  const parsedPayload = CreateOnCallRotationSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new BadRequestException(
      parsedPayload.error.issues.map((issue) => issue.message).join('; '),
    );
  }
  assertCanCreateOnCallRotationInOrganization(
    user,
    actor.organizationUnitId,
    parsedPayload.data.organizationUnitId,
  );
  const resolved = await dependencies.assignmentHelper.resolveInterval(
    parsedPayload.data.personId,
    new Date(parsedPayload.data.startTime),
    new Date(parsedPayload.data.endTime),
    parsedPayload.data.assignmentId,
  );
  if (resolved.organizationUnitId !== parsedPayload.data.organizationUnitId) {
    throw new BadRequestException(
      'On-call rotation organizationUnitId must match the effective appointment term.',
    );
  }
  return createOnCallRotationMutation(
    {
      prisma: dependencies.prisma,
      auditHelper: dependencies.auditHelper,
      user,
      actorId: actor.id,
      assignmentHelper: dependencies.assignmentHelper,
    },
    parsedPayload.data,
    resolved,
  );
}

export async function updateOnCallRotationCommand(
  dependencies: OnCallCommandDependencies,
  user: AuthenticatedIdentity,
  rotationId: string,
  payload: unknown,
) {
  const actor = await dependencies.personHelper.personForUser(user);
  if (!APPROVAL_ROLES.has(user.role)) {
    throw new ForbiddenException('Only approval-capable roles can update on-call rotations.');
  }
  const existing = await dependencies.prisma.onCallRotation.findUnique({
    where: { id: rotationId },
  });
  if (!existing) throw new NotFoundException('On-call rotation not found.');
  const parsed = UpdateOnCallRotationSchema.parse(payload);
  if (parsed.assignmentId && parsed.assignmentId !== existing.assignmentId) {
    throw new BadRequestException('On-call rotation appointment cannot be changed.');
  }
  const resolved = await dependencies.assignmentHelper.resolveInterval(
    existing.personId,
    parsed.startTime ? new Date(parsed.startTime) : existing.startTime,
    parsed.endTime ? new Date(parsed.endTime) : existing.endTime,
    existing.assignmentId,
  );
  if (resolved.organizationUnitId !== existing.organizationUnitId) {
    throw new BadRequestException(
      'Updated rotation window must remain within its appointment organization unit.',
    );
  }
  return updateOnCallRotationMutation(
    {
      prisma: dependencies.prisma,
      auditHelper: dependencies.auditHelper,
      user,
      actorId: actor.id,
      assignmentHelper: dependencies.assignmentHelper,
    },
    rotationId,
    existing,
    actor.organizationUnitId,
    parsed,
    resolved,
  );
}

export async function createOnCallDeploymentCommand(
  dependencies: OnCallCommandDependencies,
  user: AuthenticatedIdentity,
  payload: unknown,
) {
  const actor = await dependencies.personHelper.personForUser(user);
  const parsedPayload = CreateOnCallDeploymentSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new BadRequestException(
      parsedPayload.error.issues.map((issue) => issue.message).join('; '),
    );
  }
  return createOnCallDeployment(
    {
      prisma: dependencies.prisma,
      auditHelper: dependencies.auditHelper,
      closingLockHelper: dependencies.closingLockHelper,
      user,
      actorId: actor.id,
      assignmentHelper: dependencies.assignmentHelper,
    },
    parsedPayload.data,
  );
}
