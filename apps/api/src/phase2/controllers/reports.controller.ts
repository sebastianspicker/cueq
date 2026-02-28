import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('v1/reports')
export class ReportsController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get('team-absence')
  @ApiOperation({ summary: 'Team absence report with privacy suppression guardrails' })
  teamAbsence(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.phase2Service.reportTeamAbsence(user, query);
  }

  @Get('oe-overtime')
  @ApiOperation({
    summary: 'Organization-unit overtime report with privacy suppression guardrails',
  })
  oeOvertime(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.phase2Service.reportOeOvertime(user, query);
  }

  @Get('closing-completion')
  @ApiOperation({ summary: 'Closing completion report by status' })
  closingCompletion(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.phase2Service.reportClosingCompletion(user, query);
  }
}
