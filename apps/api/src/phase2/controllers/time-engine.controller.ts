import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { TimeRuleEvaluationRequestSchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TimeEngineDomainService } from '../services/time-engine-domain.service';

@ApiTags('time-engine')
@ApiBearerAuth()
@Roles(Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN)
@Controller('v1/time-engine')
export class TimeEngineController {
  constructor(
    @Inject(TimeEngineDomainService)
    private readonly timeEngineDomainService: TimeEngineDomainService,
  ) {}

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate time rules (break, rest, max-hours, surcharges)' })
  evaluate(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(TimeRuleEvaluationRequestSchema)) payload: unknown,
  ) {
    return this.timeEngineDomainService.timeEngineEvaluate(user, payload);
  }
}
