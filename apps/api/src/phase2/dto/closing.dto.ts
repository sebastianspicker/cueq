import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PayrollCsvRowDto {
  @ApiProperty({ type: String })
  personId!: string;

  @ApiProperty({ type: Number })
  targetHours!: number;

  @ApiProperty({ type: Number })
  actualHours!: number;

  @ApiProperty({ type: Number })
  balance!: number;
}

export class ExportRunDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  closingPeriodId!: string;

  @ApiProperty({ type: String })
  format!: string;

  @ApiProperty({ type: Number })
  recordCount!: number;

  @ApiProperty({ type: String })
  checksum!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  artifact?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  contentType?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  exportedAt!: string;

  @ApiProperty({ type: String })
  exportedById!: string;
}

export class ClosingExportResponseDto {
  @ApiProperty({ type: ExportRunDto })
  exportRun!: ExportRunDto;

  @ApiProperty({ type: String })
  checksum!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  csv!: string | null;

  @ApiProperty({ type: String })
  artifact!: string;

  @ApiProperty({ type: String })
  contentType!: string;

  @ApiProperty({ type: PayrollCsvRowDto, isArray: true })
  rows!: PayrollCsvRowDto[];
}
