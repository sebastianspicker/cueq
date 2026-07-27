/** Exposes the authenticated identity's self-service profile. */
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { Authenticated } from '../../common/decorators/authenticated.decorator.js';
import { DashboardBookingsService } from '../services/dashboard-bookings.service.js';

/** Authenticated self-service identity boundary. */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('v1/me')
export class MeController {
  constructor(
    @Inject(DashboardBookingsService)
    private readonly dashboardBookingsService: DashboardBookingsService,
  ) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  getMe(@CurrentUser() user: AuthenticatedIdentity) {
    return this.dashboardBookingsService.me(user);
  }
}
