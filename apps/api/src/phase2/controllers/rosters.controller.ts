import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('roster')
@ApiBearerAuth()
@Controller('v1/rosters')
export class RostersController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get('current')
  @ApiOperation({ summary: 'Get currently active roster for authenticated user organization unit' })
  current(@CurrentUser() user: AuthenticatedIdentity) {
    return this.phase2Service.currentRoster(user);
  }

  @Get(':id/plan-vs-actual')
  @ApiOperation({ summary: 'Compute plan-vs-actual compliance for roster' })
  planVsActual(@Param('id') rosterId: string) {
    return this.phase2Service.rosterPlanVsActual(rosterId);
  }
}
