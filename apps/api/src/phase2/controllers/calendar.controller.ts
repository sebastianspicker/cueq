import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TeamCalendarQuerySchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AbsenceDomainService } from '../services/absence-domain.service';
import { TeamCalendarEntryDto } from '../dto/absence.dto';

@ApiTags('calendar')
@ApiBearerAuth()
@Controller('v1/calendar')
export class CalendarController {
  constructor(
    @Inject(AbsenceDomainService) private readonly absenceService: AbsenceDomainService,
  ) {}

  @Get('team')
  @ApiOperation({ summary: 'Get team absence calendar with role-based redaction' })
  @ApiOkResponse({ type: TeamCalendarEntryDto, isArray: true })
  @ApiQuery({ name: 'start', required: false, type: String })
  @ApiQuery({ name: 'end', required: false, type: String })
  teamCalendar(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(TeamCalendarQuerySchema))
    query: { start?: string; end?: string },
  ) {
    return this.absenceService.teamCalendar(user, query.start, query.end);
  }
}
