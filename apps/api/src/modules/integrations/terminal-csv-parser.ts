/** Validates and normalizes Honeywell CSV rows without service or database dependencies. */
import { BadRequestException } from '@nestjs/common';
import { parseCsvRecords } from './csv/parse-csv.js';
import { TerminalRecordSchema, type TerminalRecord } from './terminal-contracts.js';

export type HoneywellCsvParseResult = {
  records: TerminalRecord[];
  rawRows: number;
  validRows: number;
  malformedRows: number;
};

function parseHoneywellRows(rows: Array<Record<string, string>>): TerminalRecord[] {
  const records: TerminalRecord[] = [];

  for (const raw of rows) {
    const parsed = TerminalRecordSchema.safeParse({
      personId: raw.personId,
      timeTypeCode: raw.timeTypeCode,
      startTime: raw.startTime,
      endTime: raw.endTime || undefined,
      note: raw.note || undefined,
    });
    if (parsed.success) records.push(parsed.data);
  }

  return records;
}

/** Parses known Honeywell headers, retaining malformed data rows as metrics rather than imports. */
export function parseHoneywellCsv(csv: string): HoneywellCsvParseResult {
  let headers: string[] = [];
  let rows: Array<Record<string, string>> = [];
  try {
    ({ headers, rows } = parseCsvRecords(csv));
  } catch (error) {
    throw new BadRequestException(
      `Invalid Honeywell CSV payload: ${error instanceof Error ? error.message : 'parse error'}`,
    );
  }
  if (headers.length === 0) {
    return { records: [], rawRows: 0, validRows: 0, malformedRows: 0 };
  }

  const missingHeader = ['personId', 'timeTypeCode', 'startTime'].find(
    (required) => !headers.includes(required),
  );
  if (missingHeader) {
    throw new BadRequestException(`Missing required Honeywell CSV column: ${missingHeader}`);
  }

  const records = parseHoneywellRows(rows);
  return {
    records,
    rawRows: rows.length,
    validRows: records.length,
    malformedRows: rows.length - records.length,
  };
}
