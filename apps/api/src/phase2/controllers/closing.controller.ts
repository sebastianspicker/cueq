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
import { Role } from '@cueq/database';
import {
  ClosingBookingCorrectionSchema,
  ClosingExportRequestSchema,
  ClosingPeriodMonthQuerySchema,
  PostCloseCorrectionRequestSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseCuidPipe } from '../../common/pipes/parse-cuid.pipe';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClosingDomainService } from '../services/closing-domain.service';
import type { Response } from 'express';
import { ClosingExportResponseDto } from '../dto/closing.dto';

@ApiTags('closing')
@ApiBearerAuth()
@Controller('v1/closing-periods')
export class ClosingController {
  constructor(
    @Inject(ClosingDomainService) private readonly closingService: ClosingDomainService,
  ) {}

  @Get()
  @Roles(Role.TEAM_LEAD, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'List closing periods' })
  @ApiQuery({ name: 'from', required: false, type: String })
  @ApiQuery({ name: 'to', required: false, type: String })
  @ApiQuery({ name: 'organizationUnitId', required: false, type: String })
  list(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(ClosingPeriodMonthQuerySchema))
    query: { from?: string; to?: string; organizationUnitId?: string },
  ) {
    return this.closingService.listClosingPeriods(
      user,
      query.from,
      query.to,
      query.organizationUnitId,
    );
  }

  @Get(':id')
  @Roles(Role.TEAM_LEAD, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get closing period details' })
  detail(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) closingPeriodId: string,
  ) {
    return this.closingService.getClosingPeriod(user, closingPeriodId);
  }

  @Post(':id/start-review')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Transition closing period from open to review (manual emergency override, admin-only when enabled)',
  })
  startReview(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) closingPeriodId: string,
  ) {
    return this.closingService.startClosingReview(user, closingPeriodId);
  }

  @Post(':id/lead-approve')
  @Roles(Role.TEAM_LEAD)
  @ApiOperation({ summary: 'Record team-lead sign-off for closing period' })
  leadApprove(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) closingPeriodId: string,
  ) {
    return this.closingService.leadApproveClosing(user, closingPeriodId);
  }

  @Get(':id/checklist')
  @Roles(Role.TEAM_LEAD, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Generate checklist for closing period' })
  checklist(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) closingPeriodId: string,
  ) {
    return this.closingService.closingChecklist(user, closingPeriodId);
  }

  @Post(':id/approve')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Approve closing period' })
  approve(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) closingPeriodId: string,
  ) {
    return this.closingService.approveClosing(user, closingPeriodId);
  }

  @Post(':id/export')
  @Roles(Role.HR, Role.ADMIN)
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
    @Param('id', ParseCuidPipe) closingPeriodId: string,
    @Body(new ZodValidationPipe(ClosingExportRequestSchema)) payload?: unknown,
  ) {
    return this.closingService.exportClosing(user, closingPeriodId, payload);
  }

  @Get(':closingPeriodId/export-runs/:runId/csv')
  @Roles(Role.HR, Role.ADMIN, Role.PAYROLL)
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download canonical payroll CSV artifact for an export run' })
  async downloadCsv(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('closingPeriodId', ParseCuidPipe) closingPeriodId: string,
    @Param('runId', ParseCuidPipe) runId: string,
    @Res() response: Response,
  ) {
    const result = await this.closingService.getExportRunCsv(user, closingPeriodId, runId);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename=\"${result.filename}\"`);
    response.setHeader('X-Checksum-Sha256', result.checksum);
    response.status(200).send(result.csv);
  }

  @Get(':closingPeriodId/export-runs/:runId/artifact')
  @Roles(Role.HR, Role.ADMIN, Role.PAYROLL)
  @ApiOperation({ summary: 'Download canonical payroll export artifact for an export run' })
  async downloadArtifact(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('closingPeriodId', ParseCuidPipe) closingPeriodId: string,
    @Param('runId', ParseCuidPipe) runId: string,
    @Res() response: Response,
  ) {
    const result = await this.closingService.getExportRunArtifact(user, closingPeriodId, runId);
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename=\"${result.filename}\"`);
    response.setHeader('X-Checksum-Sha256', result.checksum);
    response.status(200).send(result.artifact);
  }

  @Post(':id/post-close-corrections')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Create post-close correction workflow' })
  postCloseCorrection(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) closingPeriodId: string,
    @Body(new ZodValidationPipe(PostCloseCorrectionRequestSchema))
    payload: { reason?: string },
  ): Promise<unknown> {
    return this.closingService.postCloseCorrection(user, closingPeriodId, payload?.reason);
  }

  @Post(':id/corrections/bookings')
  @Roles(Role.HR, Role.ADMIN)
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
    @Param('id', ParseCuidPipe) closingPeriodId: string,
    @Body(new ZodValidationPipe(ClosingBookingCorrectionSchema)) payload: unknown,
  ) {
    return this.closingService.applyPostCloseBookingCorrection(user, closingPeriodId, payload);
  }

  @Post(':id/reopen')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Re-open closing period from review state (HR only)' })
  reopen(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) closingPeriodId: string,
  ) {
    return this.closingService.reopenClosing(user, closingPeriodId);
  }
}
