import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { TimeThresholdPolicyHelper } from '../helpers/time-threshold-policy.helper';
import { TimeThresholdsUpsertSchema } from '@cueq/shared';

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
  @ApiOperation({ summary: 'Upsert ArbZG time thresholds — creates a new policy version (HR/Admin)' })
  upsertThresholds(
    @CurrentUser() _user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(TimeThresholdsUpsertSchema)) payload: unknown,
  ): Promise<unknown> {
    const { dailyMaxMinutes, minRestMinutes } = payload as {
      dailyMaxMinutes: number;
      minRestMinutes: number;
    };
    return this.timeThresholdHelper.upsertThresholds(dailyMaxMinutes, minRestMinutes);
  }
}
