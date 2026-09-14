/** Small dependency-free CSV parser for import payloads, including quoted fields and BOM cleanup. */
import { consumeRowBreak, type CsvParserState } from './csv-parser-state.js';
import { consumeDelimiter, consumeLineBreak } from './csv-token-consumers.js';

function consumeQuote(state: CsvParserState, next: string | undefined): number {
  if (state.inQuotes && next === '"') {
    state.current += '"';
    return 1;
  }
  state.inQuotes = !state.inQuotes;
  return 0;
}

function consumeCharacter(state: CsvParserState, char: string, next: string | undefined): number {
  if (char === '"') return consumeQuote(state, next);
  if (consumeDelimiter(state, char)) return 0;
  const lineBreakOffset = consumeLineBreak(state, char, next);
  if (lineBreakOffset !== null) return lineBreakOffset;
  state.current += char;
  return 0;
}

function parseCsvRows(csv: string): string[][] {
  const state: CsvParserState = { rows: [], row: [], current: '', inQuotes: false };

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (char) index += consumeCharacter(state, char, csv[index + 1]);
  }

  if (state.inQuotes) {
    throw new Error('CSV parse error: unmatched quote in input.');
  }

  if (state.current.length > 0 || state.row.length > 0) {
    consumeRowBreak(state);
  }

  return state.rows;
}

/** Parses header-based CSV input and rejects ambiguous header contracts before import processing. */
export function parseCsvRecords(csv: string): {
  headers: string[];
  rows: Array<Record<string, string>>;
} {
  const parsedRows = parseCsvRows(csv);
  if (parsedRows.length < 2) {
    return { headers: [], rows: [] };
  }

  const [headerRow, ...dataRows] = parsedRows;
  if (!headerRow) {
    return { headers: [], rows: [] };
  }

  const headers = [...headerRow].map((header) => header.trim());
  if (headers[0]) {
    headers[0] = headers[0].replace(/^\ufeff/u, '');
  }
  if (headers.length === 0) {
    return { headers: [], rows: [] };
  }
  if (headers.some((header) => header.length === 0)) {
    throw new Error('CSV parse error: header names must be non-empty.');
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('CSV parse error: duplicate header names are not allowed.');
  }

  const rows = dataRows.map((values) => {
    return Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? '']));
  });

  return { headers, rows };
}
