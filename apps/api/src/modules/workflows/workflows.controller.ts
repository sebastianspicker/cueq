/** Exposes workflow inbox, decision, delegation, and policy endpoints. */
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
} from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { Roles } from '../../platform/auth/decorators/roles.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { ZodValidationPipe } from '../../platform/http/validation/zod-validation.pipe.js';
import { WorkflowsDomainService } from './workflows-domain.service.js';

/** Workflow inbox and decision boundary; runtime services serialize the resulting state transitions. */
@ApiTags('workflows')
@ApiBearerAuth()
@Controller('v1/workflows')
export class WorkflowsController {
  constructor(
    @Inject(WorkflowsDomainService)
    private readonly workflowsDomainService: WorkflowsDomainService,
  ) {}

  @Post('booking-corrections')
  @Authenticated()
  @ApiOperation({ summary: 'Create booking correction workflow request' })
  createCorrection(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(BookingCorrectionSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createBookingCorrection(user, payload);
  }

  @Post('shift-swaps')
  @Authenticated()
  @ApiOperation({ summary: 'Create shift swap workflow request' })
  createShiftSwap(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(ShiftSwapRequestSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createShiftSwapWorkflow(user, payload);
  }

  @Post('overtime-approvals')
  @Authenticated()
  @ApiOperation({ summary: 'Create overtime approval workflow request' })
  createOvertimeApproval(
    @CurrentUser() user: AuthenticatedIdentity,
    @Body(new ZodValidationPipe(OvertimeApprovalRequestSchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.createOvertimeApprovalWorkflow(user, payload);
  }

  @Get('inbox')
  @Authenticated()
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

  @Get('policies/:type')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get active policy for a workflow type (HR/Admin)' })
  policy(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('type', new ZodValidationPipe(WorkflowTypeSchema)) type: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.getWorkflowPolicy(user, type);
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
  @Authenticated()
  @ApiOperation({ summary: 'Get workflow detail' })
  detail(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) workflowId: string,
  ): Promise<unknown> {
    return this.workflowsDomainService.workflowDetail(user, workflowId);
  }

  @Post(':id/decision')
  @Authenticated()
  @ApiOperation({ summary: 'Apply workflow action (approve/reject/delegate/cancel)' })
  decide(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) workflowId: string,
    @Body(new ZodValidationPipe(WorkflowDecisionBodySchema)) payload: unknown,
  ): Promise<unknown> {
    return this.workflowsDomainService.decideWorkflow(user, workflowId, payload);
  }
}
