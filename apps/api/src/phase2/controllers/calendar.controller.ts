import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';
import { TeamCalendarEntryDto } from '../dto/absence.dto';

@ApiTags('calendar')
@ApiBearerAuth()
@Controller('v1/calendar')
export class CalendarController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get('team')
  @ApiOperation({ summary: 'Get team absence calendar with role-based redaction' })
  @ApiOkResponse({ type: TeamCalendarEntryDto, isArray: true })
  @ApiQuery({ name: 'start', required: false, type: String })
  @ApiQuery({ name: 'end', required: false, type: String })
  teamCalendar(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.phase2Service.teamCalendar(user, start, end);
  }
}
