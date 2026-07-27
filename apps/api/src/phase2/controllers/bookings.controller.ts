/** Exposes authenticated employee booking endpoints. */
import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { CreateBookingSchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { Authenticated } from '../../common/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { BookingDomainService } from '../services/booking-domain.service.js';

/** HTTP boundary for employee bookings outside controlled integration and closing-correction paths. */
@ApiTags('bookings')
@ApiBearerAuth()
@Controller('v1/bookings')
export class BookingsController {
  constructor(
    @Inject(BookingDomainService)
    private readonly bookingService: BookingDomainService,
  ) {}

  @Get('me')
  @Authenticated()
  @ApiOperation({ summary: 'List bookings for the authenticated user' })
  listMine(@CurrentUser() user: AuthenticatedIdentity) {
    return this.bookingService.listMyBookings(user);
  }

  @Get(':id')
  @Roles(Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get a booking by ID' })
  getById(@CurrentUser() user: AuthenticatedIdentity, @Param('id', ParseCuidPipe) id: string) {
    return this.bookingService.getBookingById(user, id);
  }

  @Post()
  @Authenticated()
  @ApiOperation({ summary: 'Create booking' })
  create(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(CreateBookingSchema)) payload: unknown,
  ) {
    return this.bookingService.createBooking(user, payload);
  }
}
