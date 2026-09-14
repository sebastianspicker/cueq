/** Builds deterministic payroll export artifacts from ordered time-account rows. */
import { createHash } from 'node:crypto';
import { escapeXml } from './closing-xml.js';

type ClosingExportValues = {
  personId: string;
  targetHours: number;
  actualHours: number;
  balance: number;
};

type ClosingExportRow = ClosingExportValues &
  (
    | {
        assignmentId: string;
        formatVersion: 2;
        periodStart: string;
        periodEnd: string;
      }
    | {
        assignmentId?: never;
        formatVersion?: never;
        periodStart?: never;
        periodEnd?: never;
      }
  );

export type ClosingExportArtifact = {
  artifact: string;
  checksum: string;
  contentType: string;
  rows: ClosingExportRow[];
};

export type ExistingClosingExportRun = {
  id: string;
  format: string;
  checksum: string;
  artifact: string | null;
  contentType: string | null;
  recordCount: number;
};

type TimeAccountExportSource = {
  personId: string;
  assignmentId?: string;
  periodStart?: Date;
  periodEnd?: Date;
  targetHours: { toString(): string } | number;
  actualHours: { toString(): string } | number;
  balance: { toString(): string } | number;
};

function xmlAttribute(name: string, value: string): string {
  return [' ', name, '="', escapeXml(value), '"'].join('');
}

function payrollExportStart(format: string, closingPeriodId: string): string {
  return [
    '<payrollExport',
    xmlAttribute('format', format),
    xmlAttribute('closingPeriodId', closingPeriodId),
    '>',
  ].join('');
}

function payrollRow(row: ClosingExportRow): string {
  return [
    '  <row',
    xmlAttribute('personId', row.personId),
    ...(row.formatVersion === 2
      ? [
          xmlAttribute('formatVersion', '2'),
          xmlAttribute('assignmentId', row.assignmentId),
          xmlAttribute('periodStart', row.periodStart),
          xmlAttribute('periodEnd', row.periodEnd),
        ]
      : []),
    xmlAttribute('targetHours', row.targetHours.toFixed(2)),
    xmlAttribute('actualHours', row.actualHours.toFixed(2)),
    xmlAttribute('balance', row.balance.toFixed(2)),
    ' />',
  ].join('');
}

function normalizeClosingExportRow(
  account: TimeAccountExportSource,
  versionTwo: boolean,
): ClosingExportRow {
  if (versionTwo && (!account.assignmentId || !account.periodStart || !account.periodEnd)) {
    throw new Error('Version 2 exports require appointment and account interval identifiers.');
  }
  const values: ClosingExportValues = {
    personId: account.personId,
    targetHours: Number(Number(account.targetHours).toFixed(2)),
    actualHours: Number(Number(account.actualHours).toFixed(2)),
    balance: Number(Number(account.balance).toFixed(2)),
  };
  if (!versionTwo) return values;
  const { assignmentId, periodStart, periodEnd } = account;
  if (!assignmentId || !periodStart || !periodEnd) {
    throw new Error('Version 2 exports require appointment and account interval identifiers.');
  }
  return {
    ...values,
    assignmentId,
    formatVersion: 2,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

function csvArtifact(rows: ClosingExportRow[], versionTwo: boolean): string {
  const body = rows
    .map(
      (row) =>
        `${versionTwo ? `2,${row.assignmentId},${row.periodStart},${row.periodEnd},` : ''}${row.personId},${row.targetHours.toFixed(2)},${row.actualHours.toFixed(2)},${row.balance.toFixed(2)}`,
    )
    .join('\n');
  return `${versionTwo ? 'formatVersion,assignmentId,periodStart,periodEnd,' : ''}personId,targetHours,actualHours,balance\n${body}\n`;
}

function xmlArtifact(rows: ClosingExportRow[], format: string, closingPeriodId: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    payrollExportStart(format, closingPeriodId),
    ...rows.map(payrollRow),
    '</payrollExport>',
    '',
  ].join('\n');
}

export function buildClosingExportArtifact(
  accounts: TimeAccountExportSource[],
  format: string,
  closingPeriodId: string,
): ClosingExportArtifact {
  const versionTwo = format.endsWith('_V2');
  const csv = format.startsWith('CSV_');
  const rows = accounts.map((account) => normalizeClosingExportRow(account, versionTwo));
  const artifact = csv ? csvArtifact(rows, versionTwo) : xmlArtifact(rows, format, closingPeriodId);

  return {
    artifact,
    checksum: createHash('sha256').update(artifact).digest('hex'),
    contentType: csv ? 'text/csv' : 'application/xml',
    rows,
  };
}

export function closingExportResponse(
  run: ExistingClosingExportRun,
  exportArtifact: ClosingExportArtifact,
) {
  const artifact = run.artifact ?? exportArtifact.artifact;
  return {
    exportRun: run,
    checksum: run.checksum,
    csv: run.format.startsWith('CSV_') ? artifact : null,
    artifact,
    contentType: run.contentType ?? exportArtifact.contentType,
    rows: exportArtifact.rows,
  };
}
