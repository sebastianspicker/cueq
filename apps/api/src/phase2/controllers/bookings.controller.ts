import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardBookingsService } from '../services/dashboard-bookings.service';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('v1/bookings')
export class BookingsController {
  constructor(
    @Inject(DashboardBookingsService)
    private readonly dashboardBookingsService: DashboardBookingsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'List bookings for the authenticated user' })
  listMine(@CurrentUser() user: AuthenticatedIdentity) {
    return this.dashboardBookingsService.listMyBookings(user);
  }

  @Post()
  @ApiOperation({ summary: 'Create booking' })
  create(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.dashboardBookingsService.createBooking(user, payload);
  }
}
