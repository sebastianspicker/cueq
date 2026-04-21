import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardBookingsService } from '../services/dashboard-bookings.service';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('v1/dashboard')
export class DashboardController {
  constructor(
    @Inject(DashboardBookingsService)
    private readonly dashboardBookingsService: DashboardBookingsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get dashboard summary for the authenticated employee' })
  getDashboard(@CurrentUser() user: AuthenticatedIdentity) {
    return this.dashboardBookingsService.dashboard(user);
  }
}
