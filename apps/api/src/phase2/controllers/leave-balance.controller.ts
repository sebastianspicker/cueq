/** Exposes authorized leave-balance calculations. */
import { BadRequestException, Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { parseDateOnly } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { Authenticated } from '../../common/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AbsenceDomainService } from '../services/absence-domain.service.js';
import { LeaveBalanceDto } from '../dto/absence.dto.js';

const YEAR_PATTERN = /^\d{4}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Leave-balance read boundary with employee self-service and privileged cross-person access. */
@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/leave-balance')
export class LeaveBalanceController {
  constructor(
    @Inject(AbsenceDomainService) private readonly absenceService: AbsenceDomainService,
  ) {}

  @Get('me')
  @Authenticated()
  @ApiOperation({ summary: 'Get leave balance for the authenticated user' })
  @ApiOkResponse({ type: LeaveBalanceDto })
  @ApiQuery({ name: 'year', required: false, type: String })
  @ApiQuery({ name: 'asOfDate', required: false, type: String })
  getMe(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('year') year?: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    if (year !== undefined && !YEAR_PATTERN.test(year)) {
      throw new BadRequestException('year must be a 4-digit year (e.g. 2025).');
    }
    if (asOfDate !== undefined && !DATE_PATTERN.test(asOfDate)) {
      throw new BadRequestException('asOfDate must be ISO-8601 date (YYYY-MM-DD).');
    }
    if (asOfDate !== undefined) {
      try {
        parseDateOnly(asOfDate);
      } catch {
        throw new BadRequestException('asOfDate must be a valid calendar date.');
      }
    }
    const parsedYear = year ? Number(year) : undefined;
    if (parsedYear !== undefined && (parsedYear < 1970 || parsedYear > 2200)) {
      throw new BadRequestException('year must be between 1970 and 2200.');
    }
    return this.absenceService.leaveBalance(user, parsedYear, asOfDate);
  }
}
