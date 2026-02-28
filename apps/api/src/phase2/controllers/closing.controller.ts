import { Body, Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';

@ApiTags('closing')
@ApiBearerAuth()
@Controller('v1/closing-periods')
export class ClosingController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get(':id/checklist')
  @ApiOperation({ summary: 'Generate checklist for closing period' })
  checklist(@Param('id') closingPeriodId: string) {
    return this.phase2Service.closingChecklist(closingPeriodId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve closing period' })
  approve(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.approveClosing(user, closingPeriodId);
  }

  @Post(':id/export')
  @ApiOperation({ summary: 'Export closing period run with deterministic checksum' })
  exportRun(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.exportClosing(user, closingPeriodId);
  }

  @Post(':id/post-close-corrections')
  @ApiOperation({ summary: 'Create post-close correction workflow' })
  postCloseCorrection(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') closingPeriodId: string,
    @Body() payload: { reason?: string },
  ) {
    return this.phase2Service.postCloseCorrection(user, closingPeriodId, payload?.reason);
  }
}
