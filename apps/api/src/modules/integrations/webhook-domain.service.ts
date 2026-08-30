/** Application service for webhook endpoint administration and dispatch. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { AuditHelper } from '../audit/public.js';
import { PersonHelper } from '../people/public.js';
import { createWebhookEndpoint, listWebhookEndpoints } from './webhook-endpoint-operations.js';
import { listOutboxEvents, listWebhookDeliveries } from './webhook-dispatch-queries.js';
import { dispatchWebhooks } from './webhook-dispatch-run.js';

@Injectable()
export class WebhookDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async createWebhookEndpoint(user: AuthenticatedIdentity, payload: unknown) {
    return createWebhookEndpoint(this.dependencies(), user, payload);
  }

  async listWebhookEndpoints(user: AuthenticatedIdentity) {
    return listWebhookEndpoints(this.prisma, user);
  }

  async listOutboxEvents(user: AuthenticatedIdentity, query: unknown): Promise<unknown> {
    return listOutboxEvents(this.prisma, user, query);
  }

  async listWebhookDeliveries(user: AuthenticatedIdentity, query: unknown) {
    return listWebhookDeliveries(this.prisma, user, query);
  }

  async dispatchWebhooks(user: AuthenticatedIdentity) {
    return dispatchWebhooks(this.dependencies(), user);
  }

  private dependencies() {
    return {
      prisma: this.prisma,
      personHelper: this.personHelper,
      auditHelper: this.auditHelper,
    };
  }
}
