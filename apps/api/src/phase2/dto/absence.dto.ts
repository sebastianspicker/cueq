import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ABSENCE_TYPES = [
  'ANNUAL_LEAVE',
  'SICK',
  'SPECIAL_LEAVE',
  'TRAINING',
  'TRAVEL',
  'COMP_TIME',
  'FLEX_DAY',
  'UNPAID',
  'PARENTAL',
] as const;

const ABSENCE_STATUSES = ['REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

export class CreateAbsenceDto {
  @ApiProperty({ type: String })
  personId!: string;

  @ApiProperty({ type: String, enum: ABSENCE_TYPES })
  type!: (typeof ABSENCE_TYPES)[number];

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date' })
  endDate!: string;

  @ApiPropertyOptional({ type: String })
  note?: string;
}

export class AbsenceDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  personId!: string;

  @ApiProperty({ type: String, enum: ABSENCE_TYPES })
  type!: (typeof ABSENCE_TYPES)[number];

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date' })
  endDate!: string;

  @ApiProperty({ type: Number })
  days!: number;

  @ApiProperty({ type: String, enum: ABSENCE_STATUSES })
  status!: (typeof ABSENCE_STATUSES)[number];

  @ApiPropertyOptional({ type: String, nullable: true })
  note?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class LeaveBalanceDto {
  @ApiProperty({ type: String })
  personId!: string;

  @ApiProperty({ type: Number })
  year!: number;

  @ApiProperty({ type: String, format: 'date' })
  asOfDate!: string;

  @ApiProperty({ type: Number })
  entitlement!: number;

  @ApiProperty({ type: Number })
  used!: number;

  @ApiProperty({ type: Number })
  remaining!: number;

  @ApiProperty({ type: Number })
  carriedOver!: number;

  @ApiProperty({ type: Number })
  carriedOverUsed!: number;

  @ApiProperty({ type: Number })
  forfeited!: number;

  @ApiProperty({ type: Number })
  adjustments!: number;
}

export class CreateLeaveAdjustmentDto {
  @ApiProperty({ type: String })
  personId!: string;

  @ApiProperty({ type: Number })
  year!: number;

  @ApiProperty({ type: Number })
  deltaDays!: number;

  @ApiProperty({ type: String })
  reason!: string;
}

export class LeaveAdjustmentDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  personId!: string;

  @ApiProperty({ type: Number })
  year!: number;

  @ApiProperty({ type: Number })
  deltaDays!: number;

  @ApiProperty({ type: String })
  reason!: string;

  @ApiProperty({ type: String })
  createdBy!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;
}

export class TeamCalendarEntryDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  personId!: string;

  @ApiProperty({ type: String })
  personName!: string;

  @ApiProperty({ type: String, format: 'date' })
  startDate!: string;

  @ApiProperty({ type: String, format: 'date' })
  endDate!: string;

  @ApiProperty({ type: String, enum: ABSENCE_STATUSES })
  status!: (typeof ABSENCE_STATUSES)[number];

  @ApiProperty({ type: String, enum: ['ABSENT'] })
  visibilityStatus!: 'ABSENT';

  @ApiPropertyOptional({ type: String, enum: ABSENCE_TYPES })
  type?: (typeof ABSENCE_TYPES)[number];

  @ApiPropertyOptional({ type: String, nullable: true })
  note?: string | null;
}
