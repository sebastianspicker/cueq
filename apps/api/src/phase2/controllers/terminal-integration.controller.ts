import { Body, Controller, Get, Headers, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { TerminalGatewayService } from '../terminal-gateway.service';

@ApiTags('terminal-sync')
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
