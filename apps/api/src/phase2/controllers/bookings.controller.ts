import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('v1/bookings')
export class BookingsController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get('me')
  @ApiOperation({ summary: 'List bookings for the authenticated user' })
  listMine(@CurrentUser() user: AuthenticatedIdentity) {
    return this.phase2Service.listMyBookings(user);
  }

  @Post()
  @ApiOperation({ summary: 'Create booking' })
  create(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.phase2Service.createBooking(user, payload);
  }
}
