import { Body, Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';
import type { Response } from 'express';

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
  @ApiOperation({ summary: 'Export closing period run with deterministic CSV checksum' })
  exportRun(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.exportClosing(user, closingPeriodId);
  }

  @Get(':closingPeriodId/export-runs/:runId/csv')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download canonical payroll CSV artifact for an export run' })
  async downloadCsv(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('closingPeriodId') closingPeriodId: string,
    @Param('runId') runId: string,
    @Res() response: Response,
  ) {
    const result = await this.phase2Service.getExportRunCsv(user, closingPeriodId, runId);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename=\"${result.filename}\"`);
    response.setHeader('X-Checksum-Sha256', result.checksum);
    response.status(200).send(result.csv);
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
