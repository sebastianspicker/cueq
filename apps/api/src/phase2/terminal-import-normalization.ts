/** Deterministic record ordering, payload deduplication, and ingestion identity. */
import { createHash } from 'node:crypto';
import type { TerminalRecord } from './terminal-contracts.js';

export type NormalizedTerminalRecords = {
  canonicalRecords: TerminalRecord[];
  duplicateRecordsInPayload: number;
};

function terminalRecordSortKey(record: TerminalRecord): string {
  return [
    record.startTime,
    record.personId,
    record.timeTypeCode,
    record.endTime ?? '',
    record.note ?? '',
  ].join('\u0000');
}

export function terminalRecordDedupeKey(record: TerminalRecord): string {
  return `${record.personId}:${record.timeTypeCode}:${record.startTime}:${record.endTime ?? ''}`;
}

function sortTerminalRecords(records: TerminalRecord[]): TerminalRecord[] {
  return [...records].sort((left, right) =>
    terminalRecordSortKey(left).localeCompare(terminalRecordSortKey(right)),
  );
}

export function normalizeTerminalRecords(records: TerminalRecord[]): NormalizedTerminalRecords {
  const seen = new Set<string>();
  const canonicalRecords: TerminalRecord[] = [];
  let duplicateRecordsInPayload = 0;

  for (const record of sortTerminalRecords(records)) {
    const dedupeKey = terminalRecordDedupeKey(record);
    if (seen.has(dedupeKey)) {
      duplicateRecordsInPayload += 1;
      continue;
    }
    seen.add(dedupeKey);
    canonicalRecords.push(record);
  }

  return { canonicalRecords, duplicateRecordsInPayload };
}

export function createTerminalIngestionChecksum(
  terminalId: string,
  canonicalRecords: TerminalRecord[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ terminalId, records: canonicalRecords }))
    .digest('hex');
}
