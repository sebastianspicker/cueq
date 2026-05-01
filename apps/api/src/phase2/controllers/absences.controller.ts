import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { CreateAbsenceSchema, ProratedTargetRequestSchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
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
  create(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(CreateAbsenceSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.absenceService.createAbsence(user, payload);
  }

  @Post('prorated-target')
  @Roles(Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Calculate prorated monthly target for part-time transitions' })
  proratedTarget(@Body(new ZodValidationPipe(ProratedTargetRequestSchema)) payload: unknown) {
    return this.timeEngineDomainService.computeProratedTarget(
      payload as Parameters<TimeEngineDomainService['computeProratedTarget']>[0],
    );
  }

  @Get('me')
  @ApiOperation({ summary: 'List authenticated user absences' })
  @ApiOkResponse({ type: AbsenceDto, isArray: true })
  listMine(@CurrentUser() user: AuthenticatedIdentity): Promise<unknown> {
    return this.absenceService.listMyAbsences(user);
  }

  @Get(':id')
  @Roles(Role.EMPLOYEE, Role.TEAM_LEAD, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get an absence by ID' })
  @ApiOkResponse({ type: AbsenceDto })
  getById(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) absenceId: string,
  ): Promise<unknown> {
    return this.absenceService.getAbsenceById(user, absenceId);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an existing absence request' })
  @ApiCreatedResponse({ type: AbsenceDto })
  cancel(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) absenceId: string,
  ): Promise<unknown> {
    return this.absenceService.cancelAbsence(user, absenceId);
  }
}
