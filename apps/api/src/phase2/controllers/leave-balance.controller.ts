import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';
import { LeaveBalanceDto } from '../dto/absence.dto';

@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/leave-balance')
export class LeaveBalanceController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get('me')
  @ApiOperation({ summary: 'Get leave balance for the authenticated user' })
  @ApiOkResponse({ type: LeaveBalanceDto })
  @ApiQuery({ name: 'year', required: false, type: String })
  @ApiQuery({ name: 'asOfDate', required: false, type: String })
  getMe(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('year') year?: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    return this.phase2Service.leaveBalance(user, year ? Number(year) : undefined, asOfDate);
  }
}
