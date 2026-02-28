import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('time-engine')
@ApiBearerAuth()
@Controller('v1/time-engine')
export class TimeEngineController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate time rules (break, rest, max-hours, surcharges)' })
  evaluate(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.phase2Service.timeEngineEvaluate(user, payload);
  }
}
