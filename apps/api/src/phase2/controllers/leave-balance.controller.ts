import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/leave-balance')
export class LeaveBalanceController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get('me')
  @ApiOperation({ summary: 'Get leave balance for the authenticated user' })
  getMe(@CurrentUser() user: AuthenticatedIdentity, @Query('year') year?: string) {
    return this.phase2Service.leaveBalance(user, year ? Number(year) : undefined);
  }
}
