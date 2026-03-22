import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { CreateLeaveAdjustmentSchema, LeaveAdjustmentQuerySchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CreateLeaveAdjustmentDto, LeaveAdjustmentDto } from '../dto/absence.dto';
import { AbsenceDomainService } from '../services/absence-domain.service';

@ApiTags('absences')
@ApiBearerAuth()
@Roles(Role.HR, Role.ADMIN)
@Controller('v1/leave-adjustments')
export class LeaveAdjustmentsController {
  constructor(
    @Inject(AbsenceDomainService) private readonly absenceService: AbsenceDomainService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create HR leave adjustment' })
  @ApiBody({ type: CreateLeaveAdjustmentDto })
  @ApiCreatedResponse({ type: LeaveAdjustmentDto })
  create(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(CreateLeaveAdjustmentSchema)) payload: unknown,
  ) {
    return this.absenceService.createLeaveAdjustment(user, payload);
  }

  @Get()
  @ApiOperation({ summary: 'List leave adjustments' })
  @ApiOkResponse({ type: LeaveAdjustmentDto, isArray: true })
  @ApiQuery({ name: 'personId', required: false, type: String })
  @ApiQuery({ name: 'year', required: false, type: String })
  list(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(LeaveAdjustmentQuerySchema))
    query: { personId?: string; year?: string },
  ) {
    return this.absenceService.listLeaveAdjustments(user, query);
  }
}
