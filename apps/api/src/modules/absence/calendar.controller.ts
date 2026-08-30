/** Exposes authorized team-calendar absence views. */
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { TeamCalendarQuerySchema } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { Roles } from '../../platform/auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../platform/http/validation/zod-validation.pipe.js';
import { AbsenceDomainService } from './absence-domain.service.js';
import { TeamCalendarEntryDto } from './absence.dto.js';

/** Team-calendar read boundary; responses are scoped by the underlying absence visibility policy. */
@ApiTags('calendar')
@ApiBearerAuth()
@Controller('v1/calendar')
export class CalendarController {
  constructor(
    @Inject(AbsenceDomainService) private readonly absenceService: AbsenceDomainService,
  ) {}

  @Get('team')
  @Roles(Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR)
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
