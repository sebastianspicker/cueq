/** Exposes the authenticated caller's operational dashboard summary. */
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { DashboardBookingsService } from './dashboard-bookings.service.js';

/** Authenticated dashboard read boundary for the caller's permitted operational summary. */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('v1/dashboard')
export class DashboardController {
  constructor(
    @Inject(DashboardBookingsService)
    private readonly dashboardBookingsService: DashboardBookingsService,
  ) {}

  @Get('me')
  @Authenticated()
  @ApiOperation({ summary: 'Get dashboard summary for the authenticated employee' })
  getDashboard(@CurrentUser() user: AuthenticatedIdentity) {
    return this.dashboardBookingsService.dashboard(user);
  }
}
