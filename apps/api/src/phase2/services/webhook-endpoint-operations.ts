import { randomBytes } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { CreateWebhookEndpointSchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { assertWebhookTargetUrl } from '../../common/http/webhook-url.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../helpers/audit.helper.js';
import type { PersonHelper } from '../helpers/person.helper.js';
import { HR_LIKE_ROLES } from '../helpers/role-constants.js';
import { createPersistedWebhookEndpoint } from './webhook-dispatch-endpoints.js';

type WebhookEndpointDependencies = {
  prisma: PrismaService;
  personHelper: PersonHelper;
  auditHelper: AuditHelper;
};

export async function createWebhookEndpoint(
  dependencies: WebhookEndpointDependencies,
  user: AuthenticatedIdentity,
  payload: unknown,
) {
  if (!HR_LIKE_ROLES.has(user.role)) {
    throw new ForbiddenException('Only HR/Admin can configure webhooks.');
  }
  const actor = await dependencies.personHelper.personForUser(user);
  const parsed = CreateWebhookEndpointSchema.parse(payload);
  const secret = randomBytes(32).toString('hex');
  const endpoint = await createPersistedWebhookEndpoint(
    { prisma: dependencies.prisma, auditHelper: dependencies.auditHelper },
    {
      name: parsed.name,
      url: assertWebhookTargetUrl(parsed.url).toString(),
      subscribedEvents: parsed.subscribedEvents,
    },
    actor.id,
    secret,
  );
  return {
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url,
    subscribedEvents: endpoint.subscribedEvents,
    isActive: endpoint.isActive,
    createdById: endpoint.createdById,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
    signingSecret: secret,
  };
}

export async function listWebhookEndpoints(
  prisma: Pick<PrismaService, 'webhookEndpoint'>,
  user: AuthenticatedIdentity,
) {
  if (!HR_LIKE_ROLES.has(user.role)) {
    throw new ForbiddenException('Only HR/Admin can read webhook endpoints.');
  }
  return prisma.webhookEndpoint.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      url: true,
      subscribedEvents: true,
      isActive: true,
      createdById: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
