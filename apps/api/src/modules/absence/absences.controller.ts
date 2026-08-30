/** Exposes authenticated absence request and approval endpoints. */
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
import { CreateAbsenceSchema, ProratedTargetRequestSchema } from '@cueq/contracts';
import { calculateProratedMonthlyTarget } from '@cueq/domain';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { Roles } from '../../platform/auth/decorators/roles.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { ZodValidationPipe } from '../../platform/http/validation/zod-validation.pipe.js';
import { AbsenceDomainService } from './absence-domain.service.js';
import { AbsenceDto, CreateAbsenceDto } from './absence.dto.js';

/** HTTP boundary for absence requests; domain services enforce actor scope and approval rules. */
@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/absences')
export class AbsencesController {
  constructor(
    @Inject(AbsenceDomainService) private readonly absenceService: AbsenceDomainService,
  ) {}

  @Post()
  @Authenticated()
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
    return calculateProratedMonthlyTarget(
      payload as Parameters<typeof calculateProratedMonthlyTarget>[0],
    );
  }

  @Get('me')
  @Authenticated()
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
  @Authenticated()
  @ApiOperation({ summary: 'Cancel an existing absence request' })
  @ApiCreatedResponse({ type: AbsenceDto })
  cancel(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) absenceId: string,
  ): Promise<unknown> {
    return this.absenceService.cancelAbsence(user, absenceId);
  }
}
