import { ApiProperty } from '@nestjs/swagger';

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
