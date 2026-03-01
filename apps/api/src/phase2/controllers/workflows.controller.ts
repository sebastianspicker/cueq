import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('workflows')
@ApiBearerAuth()
@Controller('v1/workflows')
export class WorkflowsController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Post('booking-corrections')
  @ApiOperation({ summary: 'Create booking correction workflow request' })
  createCorrection(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.createBookingCorrection(user, payload);
  }

  @Post('shift-swaps')
  @ApiOperation({ summary: 'Create shift swap workflow request' })
  createShiftSwap(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.createShiftSwapWorkflow(user, payload);
  }

  @Post('overtime-approvals')
  @ApiOperation({ summary: 'Create overtime approval workflow request' })
  createOvertimeApproval(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.createOvertimeApprovalWorkflow(user, payload);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'List workflow inbox for authenticated approver/requester' })
  inbox(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('overdueOnly') overdueOnly?: string,
  ): Promise<unknown> {
    return this.phase2Service.workflowInbox(user, { status, type, overdueOnly });
  }

  @Get('policies')
  @ApiOperation({ summary: 'List workflow policies (HR/Admin)' })
  policies(@CurrentUser() user: AuthenticatedIdentity): Promise<unknown> {
    return this.phase2Service.listWorkflowPolicies(user);
  }

  @Put('policies/:type')
  @ApiOperation({ summary: 'Create or update workflow policy (HR/Admin)' })
  upsertPolicy(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('type') type: string,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.upsertWorkflowPolicy(user, type, payload);
  }

  @Get('delegations')
  @ApiOperation({ summary: 'List workflow delegation rules (HR/Admin)' })
  delegations(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('delegatorId') delegatorId?: string,
    @Query('workflowType') workflowType?: string,
  ): Promise<unknown> {
    return this.phase2Service.listWorkflowDelegations(user, { delegatorId, workflowType });
  }

  @Post('delegations')
  @ApiOperation({ summary: 'Create workflow delegation rule (HR/Admin)' })
  createDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.createWorkflowDelegation(user, payload);
  }

  @Patch('delegations/:id')
  @ApiOperation({ summary: 'Update workflow delegation rule (HR/Admin)' })
  updateDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') id: string,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.updateWorkflowDelegation(user, id, payload);
  }

  @Delete('delegations/:id')
  @ApiOperation({ summary: 'Delete workflow delegation rule (HR/Admin)' })
  deleteDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.phase2Service.deleteWorkflowDelegation(user, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow detail' })
  detail(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') workflowId: string,
  ): Promise<unknown> {
    return this.phase2Service.workflowDetail(user, workflowId);
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Apply workflow action (approve/reject/delegate/cancel)' })
  decide(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') workflowId: string,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.phase2Service.decideWorkflow(user, workflowId, payload);
  }
}
