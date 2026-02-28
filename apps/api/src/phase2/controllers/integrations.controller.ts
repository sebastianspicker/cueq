import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('v1/integrations')
export class IntegrationsController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post('webhooks/endpoints')
  @ApiOperation({ summary: 'Register a webhook endpoint' })
  createEndpoint(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.phase2Service.createWebhookEndpoint(user, payload);
  }

  @Get('webhooks/endpoints')
  @ApiOperation({ summary: 'List webhook endpoints' })
  listEndpoints(@CurrentUser() user: AuthenticatedIdentity) {
    return this.phase2Service.listWebhookEndpoints(user);
  }

  @Get('events/outbox')
  @ApiOperation({ summary: 'List outbox domain events' })
  outbox(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ): Promise<unknown> {
    return this.phase2Service.listOutboxEvents(user, query);
  }

  @Post('webhooks/dispatch')
  @ApiOperation({ summary: 'Dispatch pending outbox events to subscribed endpoints' })
  dispatch(@CurrentUser() user: AuthenticatedIdentity) {
    return this.phase2Service.dispatchWebhooks(user);
  }

  @Get('webhooks/deliveries')
  @ApiOperation({ summary: 'List webhook delivery attempts' })
  deliveries(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ): Promise<unknown> {
    return this.phase2Service.listWebhookDeliveries(user, query);
  }
}
