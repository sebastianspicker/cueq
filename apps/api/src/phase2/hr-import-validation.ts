/** Parses and validates HR master-data rows before a reconciliation transaction opens. */
import { Role } from '@cueq/database';
import { parseCsvRecords } from '../common/csv/parse-csv.js';
import type { HrMasterRecord } from './hr-master-provider.port.js';

const DEFAULT_WEEKLY_HOURS = 39.83;
const DEFAULT_DAILY_TARGET_HOURS = 7.97;

export type ParsedHrImportRow = HrMasterRecord & {
  supervisorExternalId?: string;
};

export type ValidatedHrImportRow = ParsedHrImportRow & {
  parsedRole: Role;
  parsedWeeklyHours: number;
  parsedDailyTargetHours: number;
  organizationUnitId: string;
  workTimeModelId: string;
};

function csvField(row: Record<string, string>, key: string, fallback: string): string {
  return row[key] ?? fallback;
}

function parsedRowFromCsv(row: Record<string, string>): ParsedHrImportRow {
  const supervisorExternalId = row['supervisorExternalId'];
  return {
    externalId: csvField(row, 'externalId', ''),
    firstName: csvField(row, 'firstName', ''),
    lastName: csvField(row, 'lastName', ''),
    email: csvField(row, 'email', ''),
    role: csvField(row, 'role', 'EMPLOYEE'),
    organizationUnit: csvField(row, 'organizationUnit', 'Unassigned'),
    workTimeModel: csvField(row, 'workTimeModel', 'Default'),
    weeklyHours: csvField(row, 'weeklyHours', String(DEFAULT_WEEKLY_HOURS)),
    dailyTargetHours: csvField(row, 'dailyTargetHours', String(DEFAULT_DAILY_TARGET_HOURS)),
    supervisorExternalId: supervisorExternalId || undefined,
  };
}

function hasRequiredIdentity(row: ParsedHrImportRow): boolean {
  return Boolean(row.externalId && row.email && row.firstName && row.lastName);
}

function parseNonnegativeHours(value: string, fallback: number): number | null {
  const parsed = Number(value || fallback);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toRole(input: string): Role | null {
  const normalized = input.toUpperCase();
  return normalized in Role ? Role[normalized as keyof typeof Role] : null;
}

function validateRow(
  row: ParsedHrImportRow,
  seenExternalIds: Set<string>,
  seenEmails: Set<string>,
): ValidatedHrImportRow | string {
  if (!hasRequiredIdentity(row)) {
    return `Missing required fields for externalId="${row.externalId}".`;
  }
  const normalizedEmail = row.email.toLowerCase();
  if (seenExternalIds.has(row.externalId)) {
    return `Duplicate externalId in batch: "${row.externalId}".`;
  }
  if (seenEmails.has(normalizedEmail)) return `Duplicate email in batch: "${row.email}".`;

  const parsedWeeklyHours = parseNonnegativeHours(row.weeklyHours, DEFAULT_WEEKLY_HOURS);
  const parsedDailyTargetHours = parseNonnegativeHours(
    row.dailyTargetHours,
    DEFAULT_DAILY_TARGET_HOURS,
  );
  if (parsedWeeklyHours === null) {
    return `Invalid weeklyHours for externalId="${row.externalId}".`;
  }
  if (parsedDailyTargetHours === null) {
    return `Invalid dailyTargetHours for externalId="${row.externalId}".`;
  }

  const parsedRole = toRole(row.role);
  if (parsedRole === null) return `Unsupported HR role: ${row.role}`;

  seenExternalIds.add(row.externalId);
  seenEmails.add(normalizedEmail);
  return {
    ...row,
    parsedRole,
    parsedWeeklyHours,
    parsedDailyTargetHours,
    organizationUnitId: `ou_${row.organizationUnit.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`,
    workTimeModelId: `wtm_${row.workTimeModel.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`,
  };
}

export function parseHrImportCsv(csv: string): ParsedHrImportRow[] {
  const { rows } = parseCsvRecords(csv);
  return rows.map(parsedRowFromCsv);
}

export function validateHrImportRows(rows: ParsedHrImportRow[]): {
  rows: ValidatedHrImportRow[];
  errors: string[];
} {
  const errors: string[] = [];
  const seenExternalIds = new Set<string>();
  const seenEmails = new Set<string>();
  const validatedRows: ValidatedHrImportRow[] = [];

  for (const row of rows) {
    const validated = validateRow(row, seenExternalIds, seenEmails);
    if (typeof validated === 'string') errors.push(validated);
    else validatedRows.push(validated);
  }

  const byExternalId = new Map(validatedRows.map((row) => [row.externalId, row]));
  for (const row of validatedRows) {
    if (row.supervisorExternalId === row.externalId) {
      errors.push(`Supervisor cycle detected for externalId="${row.externalId}".`);
      continue;
    }
    const visited = new Set([row.externalId]);
    let supervisorExternalId = row.supervisorExternalId;
    while (supervisorExternalId && byExternalId.has(supervisorExternalId)) {
      if (visited.has(supervisorExternalId)) {
        errors.push(`Supervisor cycle detected for externalId="${row.externalId}".`);
        break;
      }
      visited.add(supervisorExternalId);
      supervisorExternalId = byExternalId.get(supervisorExternalId)?.supervisorExternalId;
    }
  }

  return { rows: validatedRows, errors: [...new Set(errors)] };
}
