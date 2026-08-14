/** Builds deterministic payroll export artifacts from ordered time-account rows. */
import { createHash } from 'node:crypto';
import { escapeXml } from './closing-utils.js';

type ClosingExportRow = {
  personId: string;
  targetHours: number;
  actualHours: number;
  balance: number;
};

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
    xmlAttribute('targetHours', row.targetHours.toFixed(2)),
    xmlAttribute('actualHours', row.actualHours.toFixed(2)),
    xmlAttribute('balance', row.balance.toFixed(2)),
    ' />',
  ].join('');
}

function normalizeClosingExportRow(account: TimeAccountExportSource): ClosingExportRow {
  return {
    personId: account.personId,
    targetHours: Number(Number(account.targetHours).toFixed(2)),
    actualHours: Number(Number(account.actualHours).toFixed(2)),
    balance: Number(Number(account.balance).toFixed(2)),
  };
}

function csvArtifact(rows: ClosingExportRow[]): string {
  const body = rows
    .map(
      (row) =>
        `${row.personId},${row.targetHours.toFixed(2)},${row.actualHours.toFixed(2)},${row.balance.toFixed(2)}`,
    )
    .join('\n');
  return `personId,targetHours,actualHours,balance\n${body}\n`;
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
  const rows = accounts.map(normalizeClosingExportRow);
  const artifact =
    format === 'CSV_V1' ? csvArtifact(rows) : xmlArtifact(rows, format, closingPeriodId);

  return {
    artifact,
    checksum: createHash('sha256').update(artifact).digest('hex'),
    contentType: format === 'CSV_V1' ? 'text/csv' : 'application/xml',
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
    csv: run.format === 'CSV_V1' ? artifact : null,
    artifact,
    contentType: run.contentType ?? exportArtifact.contentType,
    rows: exportArtifact.rows,
  };
}
