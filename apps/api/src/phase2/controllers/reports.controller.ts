import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import {
  TeamAbsenceQuerySchema,
  OeOvertimeQuerySchema,
  ClosingCompletionQuerySchema,
  AuditSummaryQuerySchema,
  ComplianceSummaryQuerySchema,
  CustomReportPreviewQueryParamsSchema,
} from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ReportingService } from '../services/reporting.service';
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
  constructor(@Inject(ReportingService) private readonly reportingService: ReportingService) {}

  @Get('team-absence')
  @Roles(Role.TEAM_LEAD, Role.HR, Role.ADMIN, Role.DATA_PROTECTION, Role.WORKS_COUNCIL)
  @ApiOperation({ summary: 'Team absence report with privacy suppression guardrails' })
  @ApiOkResponse({ type: TeamAbsenceReportDto })
  @ApiQuery({ name: 'organizationUnitId', required: false, type: String })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  teamAbsence(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(TeamAbsenceQuerySchema)) query: unknown,
  ) {
    return this.reportingService.reportTeamAbsence(user, query);
  }

  @Get('oe-overtime')
  @Roles(Role.TEAM_LEAD, Role.HR, Role.ADMIN, Role.DATA_PROTECTION, Role.WORKS_COUNCIL)
  @ApiOperation({
    summary: 'Organization-unit overtime report with privacy suppression guardrails',
  })
  @ApiOkResponse({ type: OeOvertimeReportDto })
  @ApiQuery({ name: 'organizationUnitId', required: false, type: String })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  oeOvertime(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(OeOvertimeQuerySchema)) query: unknown,
  ) {
    return this.reportingService.reportOeOvertime(user, query);
  }

  @Get('closing-completion')
  @Roles(Role.TEAM_LEAD, Role.HR, Role.ADMIN, Role.DATA_PROTECTION, Role.WORKS_COUNCIL)
  @ApiOperation({ summary: 'Closing completion report by status' })
  @ApiOkResponse({ type: ClosingCompletionReportDto })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  closingCompletion(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(ClosingCompletionQuerySchema)) query: unknown,
  ) {
    return this.reportingService.reportClosingCompletion(user, query);
  }

  @Get('audit-summary')
  @Roles(Role.HR, Role.ADMIN, Role.DATA_PROTECTION, Role.WORKS_COUNCIL)
  @ApiOperation({ summary: 'Aggregate audit activity summary for reporting period' })
  @ApiOkResponse({ type: AuditSummaryReportDto })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  auditSummary(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(AuditSummaryQuerySchema)) query: unknown,
  ) {
    return this.reportingService.reportAuditSummary(user, query);
  }

  @Get('compliance-summary')
  @Roles(Role.HR, Role.ADMIN, Role.DATA_PROTECTION, Role.WORKS_COUNCIL)
  @ApiOperation({ summary: 'Aggregate compliance and privacy summary for reporting period' })
  @ApiOkResponse({ type: ComplianceSummaryReportDto })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  complianceSummary(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(ComplianceSummaryQuerySchema)) query: unknown,
  ) {
    return this.reportingService.reportComplianceSummary(user, query);
  }

  @Get('custom/options')
  @Roles(Role.TEAM_LEAD, Role.HR, Role.ADMIN, Role.DATA_PROTECTION, Role.WORKS_COUNCIL)
  @ApiOperation({ summary: 'List whitelisted custom report builder options' })
  customOptions(@CurrentUser() user: AuthenticatedIdentity) {
    return this.reportingService.reportCustomOptions(user);
  }

  @Get('custom/preview')
  @Roles(Role.TEAM_LEAD, Role.HR, Role.ADMIN, Role.DATA_PROTECTION, Role.WORKS_COUNCIL)
  @ApiOperation({ summary: 'Preview custom report builder output (aggregate only)' })
  customPreview(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(CustomReportPreviewQueryParamsSchema)) query: unknown,
  ) {
    return this.reportingService.reportCustomPreview(user, query);
  }
}
