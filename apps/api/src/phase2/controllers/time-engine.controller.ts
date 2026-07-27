/** Exposes authorized working-time rule evaluations. */
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { TimeRuleEvaluationRequestSchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TimeEngineDomainService } from '../services/time-engine-domain.service.js';

/** Time-engine evaluation boundary for authorized, policy-derived working-time results. */
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
