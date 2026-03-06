import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { OutboxStatus } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service';

@Injectable()
export class EventOutboxHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async enqueueDomainEvent(input: {
    eventType: 'booking.created' | 'closing.completed' | 'export.ready' | 'violation.detected';
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  }) {
    return this.prisma.domainEventOutbox.create({
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
