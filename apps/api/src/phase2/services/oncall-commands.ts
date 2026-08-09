import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  CreateOnCallDeploymentSchema,
  CreateOnCallRotationSchema,
  UpdateOnCallRotationSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../helpers/audit.helper.js';
import type { ClosingLockHelper } from '../helpers/closing-lock.helper.js';
import type { PersonHelper } from '../helpers/person.helper.js';
import { APPROVAL_ROLES } from '../helpers/role-constants.js';
import { createOnCallDeployment } from './oncall-deployment.js';
import {
  assertCanCreateOnCallRotationInOrganization,
  createOnCallRotationMutation,
  updateOnCallRotationMutation,
} from './oncall-rotation-mutations.js';

type OnCallCommandDependencies = {
  prisma: PrismaService;
  personHelper: PersonHelper;
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
  return createOnCallRotationMutation(
    {
      prisma: dependencies.prisma,
      auditHelper: dependencies.auditHelper,
      user,
      actorId: actor.id,
    },
    parsedPayload.data,
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
  return updateOnCallRotationMutation(
    {
      prisma: dependencies.prisma,
      auditHelper: dependencies.auditHelper,
      user,
      actorId: actor.id,
    },
    rotationId,
    existing,
    actor.organizationUnitId,
    parsed,
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
    },
    parsedPayload.data,
  );
}
