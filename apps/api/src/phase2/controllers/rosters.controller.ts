import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import {
  CreateRosterSchema,
  CreateShiftSchema,
  UpdateShiftSchema,
  AssignShiftSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RosterDomainService } from '../services/roster-domain.service';

@ApiTags('roster')
@ApiBearerAuth()
@Controller('v1/rosters')
export class RostersController {
  constructor(@Inject(RosterDomainService) private readonly rosterService: RosterDomainService) {}

  @Post()
  @Roles(Role.SHIFT_PLANNER)
  @ApiOperation({ summary: 'Create draft roster' })
  createRoster(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(CreateRosterSchema)) payload: unknown,
  ) {
    return this.rosterService.createRoster(user, payload);
  }

  @Get('current')
  @ApiOperation({ summary: 'Get currently active roster for authenticated user organization unit' })
  current(@CurrentUser() user: AuthenticatedIdentity) {
    return this.rosterService.currentRoster(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get roster detail with shifts and assignments' })
  byId(@CurrentUser() user: AuthenticatedIdentity, @Param('id', ParseCuidPipe) rosterId: string) {
    return this.rosterService.rosterById(user, rosterId);
  }

  @Post(':id/shifts')
  @Roles(Role.SHIFT_PLANNER)
  @ApiOperation({ summary: 'Create shift in draft roster' })
  createShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) rosterId: string,
    @Body(new ZodValidationPipe(CreateShiftSchema)) payload: unknown,
  ) {
    return this.rosterService.createRosterShift(user, rosterId, payload);
  }

  @Patch(':id/shifts/:shiftId')
  @Roles(Role.SHIFT_PLANNER)
  @ApiOperation({ summary: 'Update shift in draft roster' })
  updateShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) rosterId: string,
    @Param('shiftId', ParseCuidPipe) shiftId: string,
    @Body(new ZodValidationPipe(UpdateShiftSchema)) payload: unknown,
  ) {
    return this.rosterService.updateRosterShift(user, rosterId, shiftId, payload);
  }

  @Delete(':id/shifts/:shiftId')
  @Roles(Role.SHIFT_PLANNER)
  @ApiOperation({ summary: 'Delete shift from draft roster' })
  deleteShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) rosterId: string,
    @Param('shiftId', ParseCuidPipe) shiftId: string,
  ) {
    return this.rosterService.deleteRosterShift(user, rosterId, shiftId);
  }

  @Post(':id/shifts/:shiftId/assignments')
  @Roles(Role.SHIFT_PLANNER)
  @ApiOperation({ summary: 'Assign person to shift in draft roster' })
  assignShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) rosterId: string,
    @Param('shiftId', ParseCuidPipe) shiftId: string,
    @Body(new ZodValidationPipe(AssignShiftSchema)) payload: unknown,
  ) {
    return this.rosterService.assignRosterShift(user, rosterId, shiftId, payload);
  }

  @Delete(':id/shifts/:shiftId/assignments/:assignmentId')
  @Roles(Role.SHIFT_PLANNER)
  @ApiOperation({ summary: 'Remove person assignment from shift in draft roster' })
  unassignShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) rosterId: string,
    @Param('shiftId', ParseCuidPipe) shiftId: string,
    @Param('assignmentId', ParseCuidPipe) assignmentId: string,
  ) {
    return this.rosterService.unassignRosterShift(user, rosterId, shiftId, assignmentId);
  }

  @Post(':id/publish')
  @Roles(Role.SHIFT_PLANNER)
  @ApiOperation({ summary: 'Publish draft roster after min-staffing checks' })
  publish(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) rosterId: string,
  ) {
    return this.rosterService.publishRoster(user, rosterId);
  }

  @Get(':id/plan-vs-actual')
  @ApiOperation({ summary: 'Compute plan-vs-actual compliance for roster' })
  planVsActual(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) rosterId: string,
  ) {
    return this.rosterService.rosterPlanVsActual(user, rosterId);
  }
}
