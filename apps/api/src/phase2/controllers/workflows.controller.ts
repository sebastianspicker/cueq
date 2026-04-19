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
import { Role } from '@cueq/database';
import {
  BookingCorrectionSchema,
  ShiftSwapRequestSchema,
  OvertimeApprovalRequestSchema,
  WorkflowInboxQuerySchema,
  WorkflowPolicyUpsertSchema,
  WorkflowTypeSchema,
  WorkflowDecisionBodySchema,
  WorkflowDelegationQuerySchema,
  CreateWorkflowDelegationRuleSchema,
  UpdateWorkflowDelegationRuleSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
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
    @Body(new ZodValidationPipe(BookingCorrectionSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createBookingCorrection(user, payload);
  }

  @Post('shift-swaps')
  @ApiOperation({ summary: 'Create shift swap workflow request' })
  createShiftSwap(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(ShiftSwapRequestSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createShiftSwapWorkflow(user, payload);
  }

  @Post('overtime-approvals')
  @ApiOperation({ summary: 'Create overtime approval workflow request' })
  createOvertimeApproval(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(OvertimeApprovalRequestSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createOvertimeApprovalWorkflow(user, payload);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'List workflow inbox for authenticated approver/requester' })
  inbox(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(WorkflowInboxQuerySchema))
    query: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.workflowInbox(user, query);
  }

  @Get('policies')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'List active workflow policies (HR/Admin)' })
  policies(@CurrentUser() user: AuthenticatedIdentity): Promise<unknown> {
    return this.workflowsDomainService.listWorkflowPolicies(user);
  }

  @Get('policies/:type/history')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'List policy version history for a workflow type (HR/Admin)' })
  policyHistory(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('type', new ZodValidationPipe(WorkflowTypeSchema)) type: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.listWorkflowPolicyHistory(user, type);
  }

  @Put('policies/:type')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Create new policy version for a workflow type (HR/Admin)' })
  upsertPolicy(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('type', new ZodValidationPipe(WorkflowTypeSchema)) type: string,
    @Body(new ZodValidationPipe(WorkflowPolicyUpsertSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.upsertWorkflowPolicy(user, type, payload);
  }

  @Get('delegations')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'List workflow delegation rules (HR/Admin)' })
  delegations(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(WorkflowDelegationQuerySchema))
    query: { delegatorId?: string; workflowType?: string },
  ): Promise<unknown> {
    return this.workflowsDomainService.listWorkflowDelegations(user, query);
  }

  @Post('delegations')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Create workflow delegation rule (HR/Admin)' })
  createDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(CreateWorkflowDelegationRuleSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createWorkflowDelegation(user, payload);
  }

  @Patch('delegations/:id')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Update workflow delegation rule (HR/Admin)' })
  updateDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Body(new ZodValidationPipe(UpdateWorkflowDelegationRuleSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.updateWorkflowDelegation(user, id, payload);
  }

  @Delete('delegations/:id')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Delete workflow delegation rule (HR/Admin)' })
  deleteDelegation(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.deleteWorkflowDelegation(user, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow detail' })
  detail(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) workflowId: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.workflowDetail(user, workflowId);
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Apply workflow action (approve/reject/delegate/cancel)' })
  decide(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) workflowId: string,
    @Body(new ZodValidationPipe(WorkflowDecisionBodySchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.decideWorkflow(user, workflowId, payload);
  }
}
