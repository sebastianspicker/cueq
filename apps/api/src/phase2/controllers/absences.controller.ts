import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/absences')
export class AbsencesController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post()
  @ApiOperation({ summary: 'Create absence request' })
  create(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown): Promise<unknown> {
    return this.phase2Service.createAbsence(user, payload);
  }

  @Post('prorated-target')
  @ApiOperation({ summary: 'Calculate prorated monthly target for part-time transitions' })
  proratedTarget(
    @Body()
    payload: {
      month: string;
      actualHours: number;
      transitionAdjustmentHours?: number;
      segments: Array<{ from: string; to: string; weeklyHours: number }>;
    },
  ) {
    return this.phase2Service.computeProratedTarget(payload);
  }

  @Get('me')
  @ApiOperation({ summary: 'List authenticated user absences' })
  listMine(@CurrentUser() user: AuthenticatedIdentity): Promise<unknown> {
    return this.phase2Service.listMyAbsences(user);
  }
}
