/** Exposes integration-token-protected terminal heartbeat and health endpoints. */
import { Body, Controller, Get, Headers, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '../../platform/auth/decorators/public.decorator.js';
import { TerminalGatewayService } from './terminal-gateway.service.js';

/** Integration-token boundary for recording heartbeats and reading terminal health. */
@ApiTags('terminal-sync')
@ApiSecurity('integration-token')
@Controller('v1/terminal')
export class TerminalIntegrationController {
  constructor(
    @Inject(TerminalGatewayService) private readonly terminalGatewayService: TerminalGatewayService,
  ) {}

  @Post('heartbeats')
  @Public()
  @ApiOperation({ summary: 'Record terminal heartbeat (integration token required)' })
  recordHeartbeat(
    @Headers('x-integration-token') integrationToken: string | string[] | undefined,
    @Body() payload: unknown,
  ) {
    return this.terminalGatewayService.recordHeartbeat(integrationToken, payload);
  }

  @Get('health')
  @Public()
  @ApiOperation({ summary: 'Read terminal health snapshot (integration token required)' })
  health(@Headers('x-integration-token') integrationToken: string | string[] | undefined) {
    return this.terminalGatewayService.health(integrationToken);
  }
}
