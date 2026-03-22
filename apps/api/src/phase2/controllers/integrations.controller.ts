import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { WebhookDomainService } from '../services/webhook-domain.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('v1/integrations')
export class IntegrationsController {
  constructor(
    @Inject(WebhookDomainService) private readonly webhookService: WebhookDomainService,
  ) {}

  @Post('webhooks/endpoints')
  @ApiOperation({ summary: 'Register a webhook endpoint' })
  createEndpoint(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.webhookService.createWebhookEndpoint(user, payload);
  }

  @Get('webhooks/endpoints')
  @ApiOperation({ summary: 'List webhook endpoints' })
  listEndpoints(@CurrentUser() user: AuthenticatedIdentity) {
    return this.webhookService.listWebhookEndpoints(user);
  }

  @Get('events/outbox')
  @ApiOperation({ summary: 'List outbox domain events' })
  outbox(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ): Promise<unknown> {
    return this.webhookService.listOutboxEvents(user, query);
  }

  @Post('webhooks/dispatch')
  @ApiOperation({ summary: 'Dispatch pending outbox events to subscribed endpoints' })
  dispatch(@CurrentUser() user: AuthenticatedIdentity) {
    return this.webhookService.dispatchWebhooks(user);
  }

  @Get('webhooks/deliveries')
  @ApiOperation({ summary: 'List webhook delivery attempts' })
  deliveries(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ): Promise<unknown> {
    return this.webhookService.listWebhookDeliveries(user, query);
  }
}
