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
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateLeaveAdjustmentDto, LeaveAdjustmentDto } from '../dto/absence.dto';
import { Phase2Service } from '../phase2.service';

@ApiTags('absences')
@ApiBearerAuth()
@Controller('v1/leave-adjustments')
export class LeaveAdjustmentsController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post()
  @ApiOperation({ summary: 'Create HR leave adjustment' })
  @ApiBody({ type: CreateLeaveAdjustmentDto })
  @ApiCreatedResponse({ type: LeaveAdjustmentDto })
  create(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.phase2Service.createLeaveAdjustment(user, payload);
  }

  @Get()
  @ApiOperation({ summary: 'List leave adjustments' })
  @ApiOkResponse({ type: LeaveAdjustmentDto, isArray: true })
  @ApiQuery({ name: 'personId', required: false, type: String })
  @ApiQuery({ name: 'year', required: false, type: String })
  list(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('personId') personId?: string,
    @Query('year') year?: string,
  ) {
    return this.phase2Service.listLeaveAdjustments(user, {
      personId,
      year,
    });
  }
}
