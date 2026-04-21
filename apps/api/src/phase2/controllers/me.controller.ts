import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { DashboardBookingsService } from '../services/dashboard-bookings.service';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('v1/me')
export class MeController {
  constructor(
    @Inject(DashboardBookingsService)
    private readonly dashboardBookingsService: DashboardBookingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  getMe(@CurrentUser() user: AuthenticatedIdentity) {
    return this.dashboardBookingsService.me(user);
  }
}
