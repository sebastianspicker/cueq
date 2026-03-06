import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TimeEngineDomainService } from '../services/time-engine-domain.service';

@ApiTags('time-engine')
@ApiBearerAuth()
@Controller('v1/time-engine')
export class TimeEngineController {
  constructor(
    @Inject(TimeEngineDomainService)
    private readonly timeEngineDomainService: TimeEngineDomainService,
  ) {}

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate time rules (break, rest, max-hours, surcharges)' })
  evaluate(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.timeEngineDomainService.timeEngineEvaluate(user, payload);
  }
}
