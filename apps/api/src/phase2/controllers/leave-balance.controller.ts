import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AbsenceDomainService } from '../services/absence-domain.service';
import { LeaveBalanceDto } from '../dto/absence.dto';

@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/leave-balance')
export class LeaveBalanceController {
  constructor(@Inject(AbsenceDomainService) private readonly absenceService: AbsenceDomainService) {}

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
    return this.absenceService.leaveBalance(user, year ? Number(year) : undefined, asOfDate);
  }
}
