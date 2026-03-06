import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReportingService } from '../services/reporting.service';
import type {
  AuditSummaryQueryDto,
  ClosingCompletionQueryDto,
  ComplianceSummaryQueryDto,
  OeOvertimeQueryDto,
  TeamAbsenceQueryDto,
} from '../dto/reporting.dto';
import {
  AuditSummaryReportDto,
  ClosingCompletionReportDto,
  ComplianceSummaryReportDto,
  OeOvertimeReportDto,
  TeamAbsenceReportDto,
} from '../dto/reporting.dto';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('v1/reports')
export class ReportsController {
  constructor(
    @Inject(ReportingService) private readonly reportingService: ReportingService,
  ) {}

  @Get('team-absence')
  @ApiOperation({ summary: 'Team absence report with privacy suppression guardrails' })
  @ApiOkResponse({ type: TeamAbsenceReportDto })
  @ApiQuery({ name: 'organizationUnitId', required: false, type: String })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  teamAbsence(@CurrentUser() user: AuthenticatedIdentity, @Query() query: TeamAbsenceQueryDto) {
    return this.reportingService.reportTeamAbsence(user, query);
  }

  @Get('oe-overtime')
  @ApiOperation({
    summary: 'Organization-unit overtime report with privacy suppression guardrails',
  })
  @ApiOkResponse({ type: OeOvertimeReportDto })
  @ApiQuery({ name: 'organizationUnitId', required: false, type: String })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  oeOvertime(@CurrentUser() user: AuthenticatedIdentity, @Query() query: OeOvertimeQueryDto) {
    return this.reportingService.reportOeOvertime(user, query);
  }

  @Get('closing-completion')
  @ApiOperation({ summary: 'Closing completion report by status' })
  @ApiOkResponse({ type: ClosingCompletionReportDto })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  closingCompletion(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: ClosingCompletionQueryDto,
  ) {
    return this.reportingService.reportClosingCompletion(user, query);
  }

  @Get('audit-summary')
  @ApiOperation({ summary: 'Aggregate audit activity summary for reporting period' })
  @ApiOkResponse({ type: AuditSummaryReportDto })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  auditSummary(@CurrentUser() user: AuthenticatedIdentity, @Query() query: AuditSummaryQueryDto) {
    return this.reportingService.reportAuditSummary(user, query);
  }

  @Get('compliance-summary')
  @ApiOperation({ summary: 'Aggregate compliance and privacy summary for reporting period' })
  @ApiOkResponse({ type: ComplianceSummaryReportDto })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  complianceSummary(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: ComplianceSummaryQueryDto,
  ) {
    return this.reportingService.reportComplianceSummary(user, query);
  }

  @Get('custom/options')
  @ApiOperation({ summary: 'List whitelisted custom report builder options' })
  customOptions(@CurrentUser() user: AuthenticatedIdentity) {
    return this.reportingService.reportCustomOptions(user);
  }

  @Get('custom/preview')
  @ApiOperation({ summary: 'Preview custom report builder output (aggregate only)' })
  customPreview(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query() query: Record<string, unknown>,
  ) {
    return this.reportingService.reportCustomPreview(user, query);
  }
}
