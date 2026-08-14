import { Role } from '@prisma/client';
import { parseCsvRecords } from './csv.mjs';

function recordField(row, key, fallback) {
  return row[key] ?? fallback;
}

function parsedRowFromRecord(row) {
  const supervisorExternalId = row.supervisorExternalId;
  return {
    externalId: recordField(row, 'externalId', ''),
    firstName: recordField(row, 'firstName', ''),
    lastName: recordField(row, 'lastName', ''),
    email: recordField(row, 'email', ''),
    role: recordField(row, 'role', 'EMPLOYEE'),
    organizationUnit: recordField(row, 'organizationUnit', 'Unassigned'),
    workTimeModel: recordField(row, 'workTimeModel', 'Default'),
    weeklyHours: recordField(row, 'weeklyHours', '39.83'),
    dailyTargetHours: recordField(row, 'dailyTargetHours', '7.97'),
    supervisorExternalId: supervisorExternalId || undefined,
  };
}

export function parseCsv(csv) {
  const { rows } = parseCsvRecords(csv);
  return rows.map(parsedRowFromRecord);
}

function slug(prefix, value) {
  return `${prefix}_${value.toLowerCase().replace(/[^a-z0-9]+/giu, '_')}`;
}

function toRole(input) {
  const normalized = String(input || 'EMPLOYEE').toUpperCase();
  if (Object.prototype.hasOwnProperty.call(Role, normalized)) {
    return Role[normalized];
  }

  throw new Error(`Unsupported HR role: ${input}`);
}

export function validateRows(rows) {
  const errors = [];
  const seenExternalIds = new Set();
  const seenEmails = new Set();

  const validatedRows = rows.flatMap((row) => {
    if (!row.externalId || !row.email || !row.firstName || !row.lastName) {
      errors.push(`Missing required fields for externalId="${row.externalId}".`);
      return [];
    }

    if (seenExternalIds.has(row.externalId)) {
      errors.push(`Duplicate externalId in batch: "${row.externalId}".`);
      return [];
    }
    if (seenEmails.has(row.email.toLowerCase())) {
      errors.push(`Duplicate email in batch: "${row.email}".`);
      return [];
    }

    seenExternalIds.add(row.externalId);
    seenEmails.add(row.email.toLowerCase());

    const weeklyHours = Number(row.weeklyHours || '39.83');
    const dailyTargetHours = Number(row.dailyTargetHours || '7.97');
    if (!Number.isFinite(weeklyHours) || weeklyHours < 0) {
      errors.push(`Invalid weeklyHours for externalId="${row.externalId}".`);
      return [];
    }
    if (!Number.isFinite(dailyTargetHours) || dailyTargetHours < 0) {
      errors.push(`Invalid dailyTargetHours for externalId="${row.externalId}".`);
      return [];
    }

    return [
      {
        ...row,
        parsedRole: toRole(row.role),
        parsedWeeklyHours: weeklyHours,
        parsedDailyTargetHours: dailyTargetHours,
        organizationUnitId: slug('ou', row.organizationUnit),
        workTimeModelId: slug('wtm', row.workTimeModel),
      },
    ];
  });

  const byExternalId = new Map(validatedRows.map((row) => [row.externalId, row]));
  for (const row of validatedRows) {
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

  return { validatedRows, errors: [...new Set(errors)] };
}
