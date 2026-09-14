import { WebhookDispatchAcceptedSchema, WebhookDispatchJobSchema } from '@cueq/contracts';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OutboxStatus } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuditHelper } from '../audit/public.js';
import type { PersonHelper } from '../people/public.js';
import { webhookDispatchSettings } from './webhook-dispatch-settings.js';

function assertAdministrator(user: AuthenticatedIdentity) {
  if (user.role !== 'ADMIN')
    throw new ForbiddenException('Only administrators can dispatch webhooks.');
}

/** Only this explicit administrator action creates finite job membership. */
export async function dispatchWebhooks(
  dependencies: { prisma: PrismaService; personHelper: PersonHelper; auditHelper: AuditHelper },
  user: AuthenticatedIdentity,
) {
  assertAdministrator(user);
  const actor = await dependencies.personHelper.personForUser(user);
  const settings = webhookDispatchSettings();
  return dependencies.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1138425458)`;
    const active = await tx.webhookDispatchJob.findUnique({ where: { activeKey: 'dispatch' } });
    if (active)
      return WebhookDispatchAcceptedSchema.parse({ jobId: active.id, status: active.status });
    const events = await tx.domainEventOutbox.findMany({
      where: {
        status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
        attempts: { lt: settings.maxAttempts },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: settings.batchSize,
      select: { id: true },
    });
    const job = await tx.webhookDispatchJob.create({
      data: {
        activeKey: 'dispatch',
        requestedById: actor.id,
        total: events.length,
        settings,
        items: { create: events.map((event, position) => ({ eventId: event.id, position })) },
      },
    });
    await dependencies.auditHelper.appendAudit(
      {
        actorId: actor.id,
        action: 'WEBHOOK_DISPATCH_REQUESTED',
        entityType: 'WebhookDispatchJob',
        entityId: job.id,
        after: { total: job.total, settings },
      },
      tx,
    );
    return WebhookDispatchAcceptedSchema.parse({ jobId: job.id, status: job.status });
  });
}

export async function getWebhookDispatchJob(
  prisma: PrismaService,
  user: AuthenticatedIdentity,
  id: string,
) {
  assertAdministrator(user);
  const job = await prisma.webhookDispatchJob.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      total: true,
      processed: true,
      delivered: true,
      failed: true,
      skipped: true,
      configurationFaults: true,
      createdAt: true,
      startedAt: true,
      completedAt: true,
      failureCode: true,
    },
  });
  if (!job) throw new NotFoundException('Dispatch job not found.');
  return WebhookDispatchJobSchema.parse({
    ...job,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
  });
}
