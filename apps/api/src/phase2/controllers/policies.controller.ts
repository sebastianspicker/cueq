import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Phase2Service } from '../phase2.service';

@ApiTags('policy')
@ApiBearerAuth()
@Controller('v1/policies')
export class PoliciesController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get()
  @ApiOperation({ summary: 'Resolve active policy bundle for a given date' })
  bundle(@Query() query: Record<string, string | undefined>) {
    return this.phase2Service.policyBundle(query);
  }

  @Get('history')
  @ApiOperation({ summary: 'List policy catalog history entries' })
  history(@Query() query: Record<string, string | undefined>) {
    return this.phase2Service.policyHistory(query);
  }
}
