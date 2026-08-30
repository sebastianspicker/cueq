/** Persists transactional domain events for deferred, at-least-once delivery. */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { OutboxStatus } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';

type EventOutboxWriteClient = Pick<PrismaService, 'domainEventOutbox'>;

/**
 * Persists domain events in the caller's database transaction for later, at-least-once delivery.
 * It intentionally does not perform network I/O on the mutation path.
 */
@Injectable()
export class EventOutboxHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async enqueueDomainEvent(
    input: {
      eventType: 'booking.created' | 'closing.completed' | 'export.ready' | 'violation.detected';
      aggregateType: string;
      aggregateId: string;
      payload: Record<string, unknown>;
    },
    db: EventOutboxWriteClient = this.prisma,
  ) {
    return db.domainEventOutbox.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
        attempts: 0,
      },
    });
  }
}
