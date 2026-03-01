import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Phase2Service } from '../phase2.service';
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
  constructor(@Inject(Phase2Service) private readonly phase2Service: Phase2Service) {}

  @Get('team-absence')
  @ApiOperation({ summary: 'Team absence report with privacy suppression guardrails' })
  @ApiOkResponse({ type: TeamAbsenceReportDto })
  @ApiQuery({ name: 'organizationUnitId', required: false, type: String })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  teamAbsence(@CurrentUser() user: AuthenticatedIdentity, @Query() query: TeamAbsenceQueryDto) {
    return this.phase2Service.reportTeamAbsence(user, query);
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
    return this.phase2Service.reportOeOvertime(user, query);
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
    return this.phase2Service.reportClosingCompletion(user, query);
  }

  @Get('audit-summary')
  @ApiOperation({ summary: 'Aggregate audit activity summary for reporting period' })
  @ApiOkResponse({ type: AuditSummaryReportDto })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  auditSummary(@CurrentUser() user: AuthenticatedIdentity, @Query() query: AuditSummaryQueryDto) {
    return this.phase2Service.reportAuditSummary(user, query);
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
    return this.phase2Service.reportComplianceSummary(user, query);
  }
}
