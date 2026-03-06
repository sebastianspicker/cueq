import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AbsenceDomainService } from '../services/absence-domain.service';
import { TimeEngineDomainService } from '../services/time-engine-domain.service';
import { AbsenceDto, CreateAbsenceDto } from '../dto/absence.dto';

@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/absences')
export class AbsencesController {
  constructor(
    @Inject(AbsenceDomainService) private readonly absenceService: AbsenceDomainService,
    @Inject(TimeEngineDomainService)
    private readonly timeEngineDomainService: TimeEngineDomainService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create absence request' })
  @ApiBody({ type: CreateAbsenceDto })
  @ApiCreatedResponse({ type: AbsenceDto })
  create(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown): Promise<unknown> {
    return this.absenceService.createAbsence(user, payload);
  }

  @Post('prorated-target')
  @ApiOperation({ summary: 'Calculate prorated monthly target for part-time transitions' })
  proratedTarget(
    @Body()
    payload: {
      month: string;
      actualHours: number;
      transitionAdjustmentHours?: number;
      segments: Array<{ from: string; to: string; weeklyHours: number }>;
    },
  ) {
    return this.timeEngineDomainService.computeProratedTarget(payload);
  }

  @Get('me')
  @ApiOperation({ summary: 'List authenticated user absences' })
  @ApiOkResponse({ type: AbsenceDto, isArray: true })
  listMine(@CurrentUser() user: AuthenticatedIdentity): Promise<unknown> {
    return this.absenceService.listMyAbsences(user);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an existing absence request' })
  @ApiCreatedResponse({ type: AbsenceDto })
  cancel(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') absenceId: string,
  ): Promise<unknown> {
    return this.absenceService.cancelAbsence(user, absenceId);
  }
}
