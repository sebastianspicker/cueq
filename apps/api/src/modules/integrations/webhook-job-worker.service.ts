import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper } from '../audit/public.js';
import { dispatchWebhookEvent } from './webhook-dispatch-event.js';
import { postWebhook } from './webhooks/webhook-http-client.js';
import { decryptWebhookSigningSecret } from './webhooks/webhook-secret-envelope.js';
import type { WebhookDispatchSettings } from './webhook-dispatch-settings.js';
import { finalizeJobItem, renewJobOwnership, type JobOwnership } from './webhook-job-ownership.js';

/** Recovers existing administrator jobs. Outbox activity never creates a job. */
@Injectable()
export class WebhookJobWorker implements OnApplicationBootstrap {
  private readonly owner = randomUUID();
  private readonly logger = new Logger(WebhookJobWorker.name);
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  onApplicationBootstrap() {
    void this.poll();
  }

  @Interval(30_000)
  async poll() {
    if (this.running) return;
    this.running = true;
    try {
      await this.runActiveJob();
    } catch {
      this.logger.warn('Webhook job paused; an expired lease will be recovered.');
    } finally {
      this.running = false;
    }
  }

  private async runActiveJob() {
    const job = await this.prisma.webhookDispatchJob.findUnique({
      where: { activeKey: 'dispatch' },
    });
    if (!job) return;
    const settings = job.settings as unknown as WebhookDispatchSettings;
    const claimed = await this.prisma.webhookDispatchJob.updateMany({
      where: {
        id: job.id,
        generation: job.generation,
        OR: [{ status: 'PENDING' }, { status: 'RUNNING', leaseUntil: { lte: new Date() } }],
      },
      data: {
        owner: this.owner,
        generation: { increment: 1 },
        status: 'RUNNING',
        startedAt: job.startedAt ?? new Date(),
        leaseUntil: new Date(Date.now() + settings.claimLeaseMs),
      },
    });
    if (claimed.count !== 1) return;
    const ownership = { id: job.id, owner: this.owner, generation: job.generation + 1 };
    try {
      await this.processItems(ownership, settings, job.requestedById);
    } catch {
      await this.prisma.webhookDispatchJob.updateMany({
        where: ownership,
        data: { failureCode: 'WORKER_INTERRUPTED' },
      });
      throw new Error('Dispatch interrupted.');
    }
  }

  private async processItems(
    ownership: JobOwnership,
    settings: WebhookDispatchSettings,
    actorId: string,
  ) {
    for (;;) {
      await renewJobOwnership(this.prisma, ownership, settings.claimLeaseMs);
      const item = await this.prisma.webhookDispatchJobItem.findFirst({
        where: { jobId: ownership.id, outcome: null },
        orderBy: { position: 'asc' },
        include: { event: true },
      });
      if (!item) break;
      const outcome = await dispatchWebhookEvent({
        prisma: this.prisma,
        auditHelper: this.auditHelper,
        event: item.event,
        now: new Date(),
        settings,
        actorId,
        post: postWebhook,
        decrypt: decryptWebhookSigningSecret,
        renewJob: () => renewJobOwnership(this.prisma, ownership, settings.claimLeaseMs),
        finalize: (tx, result) =>
          finalizeJobItem(tx, ownership, settings.claimLeaseMs, item.id, result),
      });
      if (outcome === 'UNCLAIMED') {
        // Preserve membership until the former event lease expires; do not count it twice.
        await this.prisma.webhookDispatchJob.updateMany({
          where: ownership,
          data: { leaseUntil: new Date() },
        });
        return;
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await renewJobOwnership(tx, ownership, settings.claimLeaseMs);
      await tx.webhookDispatchJob.update({
        where: { id: ownership.id },
        data: {
          status: 'SUCCEEDED',
          activeKey: null,
          completedAt: new Date(),
          leaseUntil: null,
          owner: null,
          failureCode: null,
        },
      });
      await this.auditHelper.appendAudit(
        {
          actorId,
          action: 'WEBHOOK_DISPATCH_RUN',
          entityType: 'WebhookDispatchJob',
          entityId: ownership.id,
          after: { status: 'SUCCEEDED' },
        },
        tx,
      );
    });
  }
}
