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
import { WorkflowsDomainService } from '../services/workflows-domain.service';

@ApiTags('workflows')
@ApiBearerAuth()
@Controller('v1/workflows')
export class WorkflowsController {
  constructor(
    @Inject(WorkflowsDomainService)
    private readonly workflowsDomainService: WorkflowsDomainService,
  ) {}

  @Post('booking-corrections')
  @ApiOperation({ summary: 'Create booking correction workflow request' })
  createCorrection(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createBookingCorrection(user, payload);
  }

  @Post('shift-swaps')
  @ApiOperation({ summary: 'Create shift swap workflow request' })
  createShiftSwap(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createShiftSwapWorkflow(user, payload);
  }

  @Post('overtime-approvals')
  @ApiOperation({ summary: 'Create overtime approval workflow request' })
  createOvertimeApproval(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createOvertimeApprovalWorkflow(user, payload);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'List workflow inbox for authenticated approver/requester' })
  inbox(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('overdueOnly') overdueOnly?: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.workflowInbox(user, { status, type, overdueOnly });
  }

  @Get('policies')
  @ApiOperation({ summary: 'List workflow policies (HR/Admin)' })
  policies(@CurrentUser() user: AuthenticatedIdentity): Promise<unknown> {
    return this.workflowsDomainService.listWorkflowPolicies(user);
  }

  @Put('policies/:type')
  @ApiOperation({ summary: 'Create or update workflow policy (HR/Admin)' })
  upsertPolicy(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('type') type: string,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.upsertWorkflowPolicy(user, type, payload);
  }

  @Get('delegations')
  @ApiOperation({ summary: 'List workflow delegation rules (HR/Admin)' })
  delegations(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('delegatorId') delegatorId?: string,
    @Query('workflowType') workflowType?: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.listWorkflowDelegations(user, {
      delegatorId,
      workflowType,
    });
  }

  @Post('delegations')
  @ApiOperation({ summary: 'Create workflow delegation rule (HR/Admin)' })
  createDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createWorkflowDelegation(user, payload);
  }

  @Patch('delegations/:id')
  @ApiOperation({ summary: 'Update workflow delegation rule (HR/Admin)' })
  updateDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') id: string,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.updateWorkflowDelegation(user, id, payload);
  }

  @Delete('delegations/:id')
  @ApiOperation({ summary: 'Delete workflow delegation rule (HR/Admin)' })
  deleteDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') id: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.deleteWorkflowDelegation(user, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow detail' })
  detail(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') workflowId: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.workflowDetail(user, workflowId);
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Apply workflow action (approve/reject/delegate/cancel)' })
  decide(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') workflowId: string,
    @Body() payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.decideWorkflow(user, workflowId, payload);
  }
}
