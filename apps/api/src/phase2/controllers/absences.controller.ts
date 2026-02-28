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
import { Phase2Service } from '../phase2.service';
import { AbsenceDto, CreateAbsenceDto } from '../dto/absence.dto';

@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/absences')
export class AbsencesController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post()
  @ApiOperation({ summary: 'Create absence request' })
  @ApiBody({ type: CreateAbsenceDto })
  @ApiCreatedResponse({ type: AbsenceDto })
  create(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown): Promise<unknown> {
    return this.phase2Service.createAbsence(user, payload);
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
    return this.phase2Service.computeProratedTarget(payload);
  }

  @Get('me')
  @ApiOperation({ summary: 'List authenticated user absences' })
  @ApiOkResponse({ type: AbsenceDto, isArray: true })
  listMine(@CurrentUser() user: AuthenticatedIdentity): Promise<unknown> {
    return this.phase2Service.listMyAbsences(user);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an existing absence request' })
  @ApiCreatedResponse({ type: AbsenceDto })
  cancel(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') absenceId: string,
  ): Promise<unknown> {
    return this.phase2Service.cancelAbsence(user, absenceId);
  }
}
