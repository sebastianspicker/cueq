import { Body, Controller, Get, Inject, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';
import type { Response } from 'express';
import type { ClosingBookingCorrection } from '@cueq/shared';
import { ClosingExportResponseDto } from '../dto/closing.dto';

@ApiTags('closing')
@ApiBearerAuth()
@Controller('v1/closing-periods')
export class ClosingController {
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get()
  @ApiOperation({ summary: 'List closing periods' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'organizationUnitId', required: false, type: String })
  list(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('organizationUnitId') organizationUnitId?: string,
  ) {
    return this.phase2Service.listClosingPeriods(user, from, to, organizationUnitId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get closing period details' })
  detail(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.getClosingPeriod(user, closingPeriodId);
  }

  @Post(':id/start-review')
  @ApiOperation({
    summary:
      'Transition closing period from open to review (manual emergency override, admin-only when enabled)',
  })
  startReview(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.startClosingReview(user, closingPeriodId);
  }

  @Post(':id/lead-approve')
  @ApiOperation({ summary: 'Record team-lead sign-off for closing period' })
  leadApprove(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.leadApproveClosing(user, closingPeriodId);
  }

  @Get(':id/checklist')
  @ApiOperation({ summary: 'Generate checklist for closing period' })
  checklist(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.closingChecklist(user, closingPeriodId);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Approve closing period' })
  approve(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.approveClosing(user, closingPeriodId);
  }

  @Post(':id/export')
  @ApiOperation({ summary: 'Export closing period run with deterministic CSV checksum' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['CSV_V1', 'XML_V1'] },
      },
    },
  })
  @ApiCreatedResponse({ type: ClosingExportResponseDto })
  exportRun(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') closingPeriodId: string,
    @Body() payload?: unknown,
  ) {
    return this.phase2Service.exportClosing(user, closingPeriodId, payload);
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

  @Get(':closingPeriodId/export-runs/:runId/artifact')
  @ApiOperation({ summary: 'Download canonical payroll export artifact for an export run' })
  async downloadArtifact(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('closingPeriodId') closingPeriodId: string,
    @Param('runId') runId: string,
    @Res() response: Response,
  ) {
    const result = await this.phase2Service.getExportRunArtifact(user, closingPeriodId, runId);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename=\"${result.filename}\"`);
    response.setHeader('X-Checksum-Sha256', result.checksum);
    response.status(200).send(result.artifact);
  }

  @Post(':id/post-close-corrections')
  @ApiOperation({ summary: 'Create post-close correction workflow' })
  postCloseCorrection(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') closingPeriodId: string,
    @Body() payload: { reason?: string },
  ): Promise<unknown> {
    return this.phase2Service.postCloseCorrection(user, closingPeriodId, payload?.reason);
  }

  @Post(':id/corrections/bookings')
  @ApiOperation({ summary: 'Apply approved post-close booking correction (HR/Admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['workflowId', 'personId', 'timeTypeId', 'startTime', 'endTime', 'reason'],
      properties: {
        workflowId: { type: 'string' },
        personId: { type: 'string' },
        timeTypeId: { type: 'string' },
        startTime: { type: 'string', format: 'date-time' },
        endTime: { type: 'string', format: 'date-time' },
        reason: { type: 'string' },
        note: { type: 'string' },
      },
    },
  })
  applyBookingCorrection(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id') closingPeriodId: string,
    @Body() payload: ClosingBookingCorrection,
  ) {
    return this.phase2Service.applyPostCloseBookingCorrection(user, closingPeriodId, payload);
  }

  @Post(':id/reopen')
  @ApiOperation({ summary: 'Re-open closing period from review state (HR only)' })
  reopen(@CurrentUser() user: AuthenticatedIdentity, @Param('id') closingPeriodId: string) {
    return this.phase2Service.reopenClosing(user, closingPeriodId);
  }
}
