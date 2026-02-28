import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
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
  createCorrection(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    return this.phase2Service.createBookingCorrection(user, payload);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'List workflow inbox for authenticated approver/requester' })
  inbox(@CurrentUser() user: AuthenticatedIdentity) {
    return this.phase2Service.workflowInbox(user);
  }

  @Post(':id/decision')
  @ApiOperation({ summary: 'Approve or reject workflow instance' })
  decide(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') workflowId: string,
    @Body() payload: unknown,
  ) {
    return this.phase2Service.decideWorkflow(user, workflowId, payload);
  }
}
