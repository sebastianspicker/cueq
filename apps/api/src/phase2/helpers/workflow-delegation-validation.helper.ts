/** Validates workflow-delegation targets against live people and scope constraints. */
import { BadRequestException } from '@nestjs/common';
import { Role, type WorkflowType } from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { HR_LIKE_ROLES } from './role-constants.js';
import { isRoleAllowedForAllWorkflowTypes, isRoleAllowedForType } from './workflow-utils.js';

type PersonStore = Pick<PrismaService, 'person'>;

export async function ensureValidDelegationTarget(
  input: {
    delegatorId: string;
    delegateId: string;
    workflowType: WorkflowType | null;
    organizationUnitId?: string | null;
  },
  db: PersonStore,
) {
  if (input.delegatorId === input.delegateId) {
    throw new BadRequestException('Delegator and delegate must be different people.');
  }

  const [delegator, delegate] = await Promise.all([
    db.person.findUnique({
      where: { id: input.delegatorId },
      select: { id: true, organizationUnitId: true },
    }),
    db.person.findUnique({
      where: { id: input.delegateId },
      select: { id: true, role: true, organizationUnitId: true },
    }),
  ]);

  if (!delegator) {
    throw new BadRequestException('delegatorId person was not found.');
  }
  if (!delegate) {
    throw new BadRequestException('delegateId person was not found.');
  }

  const delegateRoleAllowed = input.workflowType
    ? isRoleAllowedForType(delegate.role, input.workflowType)
    : isRoleAllowedForAllWorkflowTypes(delegate.role);
  if (!delegateRoleAllowed) {
    if (input.workflowType) {
      throw new BadRequestException(
        `delegateId role cannot approve workflow type ${input.workflowType}.`,
      );
    }

    throw new BadRequestException(
      'delegateId role cannot be used for delegations without a specific workflowType.',
    );
  }

  const delegatedOrganizationUnitId = input.organizationUnitId ?? delegator.organizationUnitId;
  if (
    delegatedOrganizationUnitId &&
    delegate.organizationUnitId !== delegatedOrganizationUnitId &&
    !HR_LIKE_ROLES.has(delegate.role)
  ) {
    throw new BadRequestException(
      'Non-HR/Admin delegates must belong to the delegated organization unit.',
    );
  }
}

export async function validateInlineDelegation(
  input: {
    delegateToId: string;
    actorId: string;
    actorRole: string;
    actorOrganizationUnitId: string;
    requesterId: string;
    workflowType: WorkflowType;
  },
  db: PersonStore,
) {
  if (input.delegateToId === input.actorId) {
    throw new BadRequestException('Approver cannot delegate to self.');
  }
  if (input.delegateToId === input.requesterId) {
    throw new BadRequestException('Requester cannot be delegated as approver.');
  }

  const delegate = await db.person.findUnique({
    where: { id: input.delegateToId },
    select: { id: true, role: true, organizationUnitId: true },
  });
  if (!delegate) {
    throw new BadRequestException('delegateToId person was not found.');
  }
  if (!isRoleAllowedForType(delegate.role, input.workflowType)) {
    throw new BadRequestException(
      `delegateToId role cannot approve workflow type ${input.workflowType}.`,
    );
  }
  if (
    (input.actorRole === Role.TEAM_LEAD || input.actorRole === Role.SHIFT_PLANNER) &&
    delegate.organizationUnitId !== input.actorOrganizationUnitId &&
    !HR_LIKE_ROLES.has(delegate.role)
  ) {
    throw new BadRequestException(
      'Team leads and shift planners can only delegate within their own organization unit or to HR/Admin.',
    );
  }
}
