import { BadRequestException } from '@nestjs/common';
import { ClosingStatus, Role } from '@cueq/database';

/* ── Type Aliases ────────────────────────────────────────── */

export type ClosingActorRole = 'EMPLOYEE' | 'TEAM_LEAD' | 'HR' | 'ADMIN';
export type CoreClosingStatus = 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';

/* ── Role / Status Mapping ──────────────────────────────── */

/**
 * Maps a database Role to a ClosingActorRole.
 *
 * Intentional fallback: any role not explicitly mapped (e.g. SHIFT_PLANNER,
 * PAYROLL, or future roles) defaults to 'EMPLOYEE'. This is a safe default
 * that grants the least privileged closing permissions.
 */
export function toClosingActorRole(role: Role): ClosingActorRole {
  if (role === Role.HR) {
    return 'HR';
  }

  if (role === Role.ADMIN) {
    return 'ADMIN';
  }

  if (role === Role.TEAM_LEAD) {
    return 'TEAM_LEAD';
  }

  return 'EMPLOYEE';
}

export function toPersistenceClosingStatus(status: CoreClosingStatus): ClosingStatus {
  if (status === 'APPROVED') {
    return ClosingStatus.CLOSED;
  }

  if (status === 'OPEN') {
    return ClosingStatus.OPEN;
  }

  if (status === 'REVIEW') {
    return ClosingStatus.REVIEW;
  }

  return ClosingStatus.EXPORTED;
}

/* ── Response Mapping ───────────────────────────────────── */

import { toCoreClosingStatus } from './closing-lock.helper';

export function mapClosingPeriodResponse(period: {
  id: string;
  organizationUnitId: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: ClosingStatus;
  exportRuns: unknown;
  closedAt: Date | null;
  closedById: string | null;
  leadApprovedAt: Date | null;
  leadApprovedById: string | null;
  hrApprovedAt: Date | null;
  hrApprovedById: string | null;
  lockedAt: Date | null;
  lockSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: period.id,
    organizationUnitId: period.organizationUnitId,
    periodStart: period.periodStart.toISOString(),
    periodEnd: period.periodEnd.toISOString(),
    status: toCoreClosingStatus(period.status),
    exportRuns: period.exportRuns,
    closedAt: period.closedAt?.toISOString() ?? null,
    closedById: period.closedById,
    leadApprovedAt: period.leadApprovedAt?.toISOString() ?? null,
    leadApprovedById: period.leadApprovedById,
    hrApprovedAt: period.hrApprovedAt?.toISOString() ?? null,
    hrApprovedById: period.hrApprovedById,
    lockedAt: period.lockedAt?.toISOString() ?? null,
    lockSource: period.lockSource,
    createdAt: period.createdAt.toISOString(),
    updatedAt: period.updatedAt.toISOString(),
  };
}

/* ── XML Escaping ───────────────────────────────────────── */

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/* ── Month Parsing ──────────────────────────────────────── */

export function parseMonthToRange(month: string) {
  const [yearString, monthString] = month.split('-');
  const year = Number(yearString);
  const monthNumber = Number(monthString);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(monthNumber) ||
    monthNumber < 1 ||
    monthNumber > 12
  ) {
    throw new BadRequestException('Month must be in YYYY-MM format.');
  }

  const from = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59));
  return { from, to };
}

/* ── Env Config Readers ─────────────────────────────────── */

export function closingAutoCutoffEnabled(): boolean {
  const raw = (process.env.CLOSING_AUTO_CUTOFF_ENABLED ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(raw);
}

export function allowManualReviewStart(): boolean {
  const raw = (process.env.CLOSING_ALLOW_MANUAL_REVIEW_START ?? 'false').trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

export function closingCutoffDay(): number {
  const parsed = Number(process.env.CLOSING_CUTOFF_DAY ?? '3');
  if (!Number.isFinite(parsed)) {
    return 3;
  }

  return Math.min(28, Math.max(1, Math.trunc(parsed)));
}

export function closingCutoffHour(): number {
  const parsed = Number(process.env.CLOSING_CUTOFF_HOUR ?? '12');
  if (!Number.isFinite(parsed)) {
    return 12;
  }

  return Math.min(23, Math.max(0, Math.trunc(parsed)));
}

export function closingTimeZone(): string {
  const candidate = process.env.CLOSING_TIMEZONE?.trim() || 'Europe/Berlin';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return 'Europe/Berlin';
  }
}

export function closingBookingGapMinutes(): number {
  const parsed = Number(process.env.CLOSING_BOOKING_GAP_MINUTES ?? '240');
  return Number.isFinite(parsed) && parsed >= 30 ? Math.trunc(parsed) : 240;
}

export function closingBalanceAnomalyHours(): number {
  const parsed = Number(process.env.CLOSING_BALANCE_ANOMALY_HOURS ?? '40');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
}

/* ── Date / Timezone Helpers ────────────────────────────── */

function parseShortOffsetToMinutes(offset: string): number {
  if (offset === 'GMT' || offset === 'UTC') {
    return 0;
  }

  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offset);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? '0');
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

export function resolveTimeZoneOffsetMinutes(at: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const zonePart = formatter.formatToParts(at).find((part) => part.type === 'timeZoneName');
  return parseShortOffsetToMinutes(zonePart?.value ?? 'UTC');
}

export function zonedDateTimeToUtcDate(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timeZone: string;
}): Date {
  const utcGuess = new Date(
    Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0),
  );
  const offsetMinutes = resolveTimeZoneOffsetMinutes(utcGuess, input.timeZone);
  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}

export function cutoffAtForPeriod(period: { periodEnd: Date }): Date {
  const day = closingCutoffDay();
  const hour = closingCutoffHour();
  const timeZone = closingTimeZone();

  const periodYear = period.periodEnd.getUTCFullYear();
  const periodMonth = period.periodEnd.getUTCMonth() + 1;
  let cutoffYear = periodYear;
  let cutoffMonth = periodMonth + 1;
  if (cutoffMonth > 12) {
    cutoffMonth = 1;
    cutoffYear += 1;
  }

  const maxDay = new Date(Date.UTC(cutoffYear, cutoffMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDay);

  return zonedDateTimeToUtcDate({
    year: cutoffYear,
    month: cutoffMonth,
    day: clampedDay,
    hour,
    minute: 0,
    timeZone,
  });
}
