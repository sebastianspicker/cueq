/** Exposes administration endpoints for active working-time thresholds. */
import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { ZodValidationPipe } from '../../platform/http/validation/zod-validation.pipe.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { Roles } from '../../platform/auth/decorators/roles.decorator.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { TimeThresholdPolicyHelper } from './time-threshold-policy.helper.js';
import { TimeThresholdsUpsertSchema } from '@cueq/contracts';

/** Administration boundary for versioned working-time thresholds and their audit history. */
@ApiBearerAuth()
@ApiTags('time-thresholds')
@Roles(Role.HR, Role.ADMIN)
@Controller('v1/time-thresholds')
export class TimeThresholdsController {
  constructor(
    @Inject(TimeThresholdPolicyHelper)
    private readonly timeThresholdHelper: TimeThresholdPolicyHelper,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get active ArbZG time thresholds (HR/Admin)' })
  getThresholds(@CurrentUser() _user: AuthenticatedIdentity): Promise<unknown> {
    return this.timeThresholdHelper.getActiveThresholds();
  }

  @Put()
  @ApiOperation({
    summary: 'Upsert ArbZG time thresholds: creates a new policy version (HR/Admin)',
  })
  upsertThresholds(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(TimeThresholdsUpsertSchema)) payload: unknown,
  ): Promise<unknown> {
    const { dailyMaxMinutes, minRestMinutes } = payload as {
      dailyMaxMinutes: number;
      minRestMinutes: number;
    };
    return this.timeThresholdHelper.upsertThresholds(
      dailyMaxMinutes,
      minRestMinutes,
      user.personId ?? user.subject,
    );
  }
}
