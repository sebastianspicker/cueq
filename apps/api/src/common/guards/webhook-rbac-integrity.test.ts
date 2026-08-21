import { ForbiddenException } from '@nestjs/common';
import { OutboxStatus } from '@cueq/database';
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_ROUTE_METADATA } from '../decorators/authenticated.decorator.js';
import { ALLOWED_ROLES_METADATA } from '../decorators/roles.decorator.js';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public.decorator.js';
import { RolesGuard } from './roles.guard.js';
import {
  claimWebhookEvent,
  finalizeWebhookDeliveries,
  type DispatchableOutboxEvent,
} from '../../phase2/services/webhook-dispatch-claim.js';

class TestController {}

type TestContext = {
  getHandler: () => () => undefined;
  getClass: () => typeof TestController;
  switchToHttp: () => { getRequest: () => { user: { role: 'ADMIN' | 'EMPLOYEE' } } };
};

function guardFor(
  policy: 'public' | 'authenticated' | 'allowed' | 'wrong' | 'unannotated',
): RolesGuard & { context: TestContext } {
  const handler = () => undefined;
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === PUBLIC_ROUTE_METADATA) return policy === 'public';
      if (key === ALLOWED_ROLES_METADATA)
        return policy === 'allowed' || policy === 'wrong' ? ['ADMIN'] : undefined;
      return undefined;
    },
    get: (key: string) => key === AUTHENTICATED_ROUTE_METADATA && policy === 'authenticated',
  };
  const context = {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { role: (policy === 'wrong' ? 'EMPLOYEE' : 'ADMIN') as 'ADMIN' | 'EMPLOYEE' },
      }),
    }),
  };
  return Object.assign(new RolesGuard(reflector as never), { context });
}

describe('RBAC and webhook delivery integrity', () => {
  it('applies public, authenticated, allowed-role, wrong-role, and fail-closed policies', () => {
    for (const policy of ['public', 'authenticated', 'allowed'] as const) {
      const guard = guardFor(policy);
      expect(guard.canActivate(guard.context as never)).toBe(true);
    }
    for (const policy of ['wrong', 'unannotated'] as const) {
      const guard = guardFor(policy);
      expect(() => guard.canActivate(guard.context as never)).toThrow(ForbiddenException);
    }
  });

  it('rolls back event finalization with failed delivery writes and prevents duplicate claims', async () => {
    const event: DispatchableOutboxEvent = {
      id: 'event-1',
      eventType: 'shift.updated',
      aggregateType: 'Shift',
      aggregateId: 'shift-1',
      payload: {},
      status: OutboxStatus.PENDING,
      attempts: 0,
      createdAt: new Date(0),
    };
    const deliveries: Array<{
      outboxEventId: string;
      endpointId: string;
      attempt: number;
      status: 'SUCCESS';
      httpStatus: number;
      responseBody: string;
      error: null;
      deliveredAt: Date;
    }> = [];
    let failCreate = true;
    const outbox = {
      domainEventOutbox: {
        updateMany: async ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const allowed = where.status as { in?: OutboxStatus[] } | OutboxStatus | undefined;
          const statusMatches =
            typeof allowed === 'object' && Array.isArray(allowed.in)
              ? allowed.in.includes(event.status)
              : allowed === undefined || allowed === event.status;
          const lease = where.nextAttemptAt as Date | undefined;
          const leaseMatches =
            lease === undefined ||
            (event as typeof event & { nextAttemptAt?: Date | null }).nextAttemptAt?.getTime() ===
              lease.getTime();
          const due =
            where.OR === undefined ||
            (event as typeof event & { nextAttemptAt?: Date | null }).nextAttemptAt === undefined ||
            (event as typeof event & { nextAttemptAt?: Date | null }).nextAttemptAt === null;
          if (
            where.id !== event.id ||
            where.attempts !== event.attempts ||
            !statusMatches ||
            !leaseMatches ||
            !due
          )
            return { count: 0 };
          Object.assign(event, data);
          return { count: 1 };
        },
      },
    };
    type TransactionClient = typeof outbox & {
      webhookDelivery: { createMany: (input: { data: typeof deliveries }) => Promise<void> };
      $transaction: <T>(operation: (tx: TransactionClient) => Promise<T>) => Promise<T>;
    };
    let prisma: TransactionClient;
    prisma = {
      ...outbox,
      webhookDelivery: {
        createMany: async ({ data }) => {
          if (failCreate) throw new Error('delivery write failed');
          deliveries.push(...data);
        },
      },
      $transaction: async <T>(operation: (tx: TransactionClient) => Promise<T>): Promise<T> => {
        const eventSnapshot = { ...event };
        const deliveryCount = deliveries.length;
        try {
          return await operation(prisma);
        } catch (error) {
          Object.assign(event, eventSnapshot);
          deliveries.length = deliveryCount;
          throw error;
        }
      },
    };
    const claim = await claimWebhookEvent(outbox as never, event, new Date(), 60_000);
    expect(claim).toBeInstanceOf(Date);
    expect(await claimWebhookEvent(outbox as never, event, new Date(), 60_000)).toBeNull();
    const delivery = {
      eventFailed: false,
      lastError: null,
      records: [
        {
          outboxEventId: event.id,
          endpointId: 'endpoint-1',
          attempt: 1,
          status: 'SUCCESS' as const,
          httpStatus: 200,
          responseBody: 'ok',
          error: null,
          deliveredAt: new Date(),
        },
      ],
    };
    await expect(
      finalizeWebhookDeliveries(prisma as never, event, claim as Date, delivery, 3),
    ).rejects.toThrow('delivery write failed');
    expect(event.status).toBe(OutboxStatus.PENDING);
    expect(event.attempts).toBe(0);
    expect(deliveries).toEqual([]);
    failCreate = false;
    await finalizeWebhookDeliveries(prisma as never, event, claim as Date, delivery, 3);
    expect(event.status).toBe(OutboxStatus.DELIVERED);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({ outboxEventId: 'event-1', endpointId: 'endpoint-1' });
  });
});
