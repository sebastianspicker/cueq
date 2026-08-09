import { ForbiddenException } from '@nestjs/common';
import { OutboxStatus } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { postWebhook } from '../../common/http/webhook-http-client.js';
import { decryptWebhookSigningSecret } from '../../common/integrations/webhook-secret-envelope.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../helpers/audit.helper.js';
import type { PersonHelper } from '../helpers/person.helper.js';
import { HR_LIKE_ROLES } from '../helpers/role-constants.js';
import { dispatchWebhookEvent } from './webhook-dispatch-event.js';
import { webhookDispatchSettings } from './webhook-dispatch-settings.js';
import {
  emptyWebhookDispatchCounters,
  recordWebhookDispatchOutcome,
} from './webhook-dispatch-output.js';

type WebhookDispatchRunDependencies = {
  prisma: PrismaService;
  personHelper: PersonHelper;
  auditHelper: AuditHelper;
};

/** Runs pending webhook events serially and appends exactly one run audit after the loop. */
export async function dispatchWebhooks(
  dependencies: WebhookDispatchRunDependencies,
  user: AuthenticatedIdentity,
) {
  if (!HR_LIKE_ROLES.has(user.role)) {
    throw new ForbiddenException('Only HR/Admin can dispatch webhooks.');
  }
  const actor = await dependencies.personHelper.personForUser(user);
  const now = new Date();
  const settings = webhookDispatchSettings();
  const pendingEvents = await dependencies.prisma.domainEventOutbox.findMany({
    where: {
      status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
      attempts: { lt: settings.maxAttempts },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: settings.batchSize,
  });
  const counters = emptyWebhookDispatchCounters();
  for (const event of pendingEvents) {
    const outcome = await dispatchWebhookEvent({
      prisma: dependencies.prisma,
      auditHelper: dependencies.auditHelper,
      event,
      now,
      settings,
      actorId: actor.id,
      decrypt: decryptWebhookSigningSecret,
      post: postWebhook,
    });
    recordWebhookDispatchOutcome(counters, outcome);
  }
  await dependencies.auditHelper.appendAudit({
    actorId: actor.id,
    action: 'WEBHOOK_DISPATCH_RUN',
    entityType: 'DomainEventOutbox',
    entityId: `dispatch-${now.toISOString()}`,
    after: counters,
  });
  return { ...counters, ...settings };
}
