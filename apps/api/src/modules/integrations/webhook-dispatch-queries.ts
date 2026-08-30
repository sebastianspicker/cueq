import { ForbiddenException } from '@nestjs/common';
import { DeliveryQuerySchema, OutboxQuerySchema } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { HR_LIKE_ROLES } from '../people/public.js';
import { mapOutboxEvents, mapWebhookDeliveries } from './webhook-dispatch-output.js';

export async function listOutboxEvents(
  prisma: Pick<PrismaService, 'domainEventOutbox'>,
  user: AuthenticatedIdentity,
  query: unknown,
): Promise<unknown> {
  if (!HR_LIKE_ROLES.has(user.role)) {
    throw new ForbiddenException('Only HR/Admin can read outbox events.');
  }
  const parsed = OutboxQuerySchema.parse(query ?? {});
  const events = await prisma.domainEventOutbox.findMany({
    where: parsed.status ? { status: parsed.status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return mapOutboxEvents(events);
}

export async function listWebhookDeliveries(
  prisma: Pick<PrismaService, 'webhookDelivery'>,
  user: AuthenticatedIdentity,
  query: unknown,
) {
  if (!HR_LIKE_ROLES.has(user.role)) {
    throw new ForbiddenException('Only HR/Admin can read webhook deliveries.');
  }
  const parsed = DeliveryQuerySchema.parse(query ?? {});
  const deliveries = await prisma.webhookDelivery.findMany({
    where: parsed.eventId ? { outboxEventId: parsed.eventId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return mapWebhookDeliveries(deliveries);
}
