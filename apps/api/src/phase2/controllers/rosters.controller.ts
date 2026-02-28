import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('roster')
@ApiBearerAuth()
@Controller('v1/rosters')
export class RostersController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post()
  @ApiOperation({ summary: 'Create draft roster' })
  createRoster(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.phase2Service.createRoster(user, payload);
  }

  @Get('current')
  @ApiOperation({ summary: 'Get currently active roster for authenticated user organization unit' })
  current(@CurrentUser() user: AuthenticatedIdentity) {
    return this.phase2Service.currentRoster(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get roster detail with shifts and assignments' })
  byId(@CurrentUser() user: AuthenticatedIdentity, @Param('id') rosterId: string) {
    return this.phase2Service.rosterById(user, rosterId);
  }

  @Post(':id/shifts')
  @ApiOperation({ summary: 'Create shift in draft roster' })
  createShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') rosterId: string,
    @Body() payload: unknown,
  ) {
    return this.phase2Service.createRosterShift(user, rosterId, payload);
  }

  @Patch(':id/shifts/:shiftId')
  @ApiOperation({ summary: 'Update shift in draft roster' })
  updateShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') rosterId: string,
    @Param('shiftId') shiftId: string,
    @Body() payload: unknown,
  ) {
    return this.phase2Service.updateRosterShift(user, rosterId, shiftId, payload);
  }

  @Delete(':id/shifts/:shiftId')
  @ApiOperation({ summary: 'Delete shift from draft roster' })
  deleteShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') rosterId: string,
    @Param('shiftId') shiftId: string,
  ) {
    return this.phase2Service.deleteRosterShift(user, rosterId, shiftId);
  }

  @Post(':id/shifts/:shiftId/assignments')
  @ApiOperation({ summary: 'Assign person to shift in draft roster' })
  assignShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') rosterId: string,
    @Param('shiftId') shiftId: string,
    @Body() payload: unknown,
  ) {
    return this.phase2Service.assignRosterShift(user, rosterId, shiftId, payload);
  }

  @Delete(':id/shifts/:shiftId/assignments/:assignmentId')
  @ApiOperation({ summary: 'Remove person assignment from shift in draft roster' })
  unassignShift(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') rosterId: string,
    @Param('shiftId') shiftId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.phase2Service.unassignRosterShift(user, rosterId, shiftId, assignmentId);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish draft roster after min-staffing checks' })
  publish(@CurrentUser() user: AuthenticatedIdentity, @Param('id') rosterId: string) {
    return this.phase2Service.publishRoster(user, rosterId);
  }

  @Get(':id/plan-vs-actual')
  @ApiOperation({ summary: 'Compute plan-vs-actual compliance for roster' })
  planVsActual(@CurrentUser() user: AuthenticatedIdentity, @Param('id') rosterId: string) {
    return this.phase2Service.rosterPlanVsActual(user, rosterId);
  }
}
