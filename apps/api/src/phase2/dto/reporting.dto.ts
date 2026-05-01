import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TeamAbsenceQueryDto {
  @ApiPropertyOptional({ type: String })
  organizationUnitId?: string;

  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;
}

export class OeOvertimeQueryDto {
  @ApiPropertyOptional({ type: String })
  organizationUnitId?: string;

  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;
}

export class ClosingCompletionQueryDto {
  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;
}

export class AuditSummaryQueryDto {
  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;
}

export class ComplianceSummaryQueryDto {
  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;
}

export class ReportSuppressionDto {
  @ApiProperty({ type: Boolean })
  suppressed!: boolean;

  @ApiProperty({ type: Number })
  minGroupSize!: number;

  @ApiProperty({ type: Number })
  population!: number;
}

export class TeamAbsenceBucketDto {
  @ApiProperty({ type: String })
  type!: string;

  @ApiProperty({ type: Number })
  days!: number;

  @ApiProperty({ type: Number })
  requests!: number;
}

export class TeamAbsenceTotalsDto {
  @ApiProperty({ type: Number })
  requests!: number;

  @ApiProperty({ type: Number })
  days!: number;
}

export class TeamAbsenceReportDto {
  @ApiProperty({ type: String })
  organizationUnitId!: string;

  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;

  @ApiProperty({ type: ReportSuppressionDto })
  suppression!: ReportSuppressionDto;

  @ApiProperty({ type: TeamAbsenceTotalsDto })
  totals!: TeamAbsenceTotalsDto;

  @ApiProperty({ type: TeamAbsenceBucketDto, isArray: true })
  buckets!: TeamAbsenceBucketDto[];
}

export class OeOvertimeTotalsDto {
  @ApiProperty({ type: Number })
  people!: number;

  @ApiProperty({ type: Number })
  totalBalanceHours!: number;

  @ApiProperty({ type: Number })
  totalOvertimeHours!: number;

  @ApiProperty({ type: Number })
  avgBalanceHours!: number;
}

export class OeOvertimeReportDto {
  @ApiProperty({ type: String })
  organizationUnitId!: string;

  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;

  @ApiProperty({ type: ReportSuppressionDto })
  suppression!: ReportSuppressionDto;

  @ApiProperty({ type: OeOvertimeTotalsDto })
  totals!: OeOvertimeTotalsDto;
}

export class ClosingCompletionTotalsDto {
  @ApiProperty({ type: Number })
  periods!: number;

  @ApiProperty({ type: Number })
  exported!: number;

  @ApiProperty({ type: Number })
  closed!: number;

  @ApiProperty({ type: Number })
  review!: number;

  @ApiProperty({ type: Number })
  open!: number;

  @ApiProperty({ type: Number })
  completionRate!: number;
}

export class ClosingCompletionReportDto {
  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;

  @ApiProperty({ type: String, nullable: true, required: false })
  organizationUnitId?: string | null;

  @ApiProperty({ type: ClosingCompletionTotalsDto })
  totals!: ClosingCompletionTotalsDto;
}

export class ReportActionCountDto {
  @ApiProperty({ type: String })
  action!: string;

  @ApiProperty({ type: Number })
  count!: number;
}

export class ReportEntityTypeCountDto {
  @ApiProperty({ type: String })
  entityType!: string;

  @ApiProperty({ type: Number })
  count!: number;
}

export class AuditSummaryTotalsDto {
  @ApiProperty({ type: Number })
  entries!: number;

  @ApiProperty({ type: Number })
  uniqueActors!: number;

  @ApiProperty({ type: Number })
  reportAccesses!: number;

  @ApiProperty({ type: Number })
  exportsTriggered!: number;

  @ApiProperty({ type: Number })
  lockBlocks!: number;
}

export class AuditSummaryReportDto {
  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;

  @ApiProperty({ type: AuditSummaryTotalsDto })
  totals!: AuditSummaryTotalsDto;

  @ApiProperty({ type: ReportActionCountDto, isArray: true })
  byAction!: ReportActionCountDto[];

  @ApiProperty({ type: ReportEntityTypeCountDto, isArray: true })
  byEntityType!: ReportEntityTypeCountDto[];
}

export class CompliancePrivacySummaryDto {
  @ApiProperty({ type: Number })
  minGroupSize!: number;

  @ApiProperty({ type: Number })
  reportAccesses!: number;

  @ApiProperty({ type: Number })
  suppressedReportAccesses!: number;

  @ApiProperty({ type: Number })
  suppressionRate!: number;
}

export class ComplianceClosingSummaryDto {
  @ApiProperty({ type: Number })
  periods!: number;

  @ApiProperty({ type: Number })
  exported!: number;

  @ApiProperty({ type: Number })
  completionRate!: number;

  @ApiProperty({ type: Number })
  lockBlocks!: number;

  @ApiProperty({ type: Number })
  postCloseCorrections!: number;
}

export class CompliancePayrollExportSummaryDto {
  @ApiProperty({ type: Number })
  runs!: number;

  @ApiProperty({ type: Number })
  uniqueChecksums!: number;

  @ApiProperty({ type: Number })
  duplicateChecksums!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastRunAt!: string | null;
}

export class ComplianceOperationsSummaryDto {
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastBackupRestoreVerifiedAt!: string | null;
}

export class ComplianceSummaryReportDto {
  @ApiProperty({ type: String, format: 'date' })
  from!: string;

  @ApiProperty({ type: String, format: 'date' })
  to!: string;

  @ApiProperty({ type: CompliancePrivacySummaryDto })
  privacy!: CompliancePrivacySummaryDto;

  @ApiProperty({ type: ComplianceClosingSummaryDto })
  closing!: ComplianceClosingSummaryDto;

  @ApiProperty({ type: CompliancePayrollExportSummaryDto })
  payrollExport!: CompliancePayrollExportSummaryDto;

  @ApiProperty({ type: ComplianceOperationsSummaryDto })
  operations!: ComplianceOperationsSummaryDto;
}
