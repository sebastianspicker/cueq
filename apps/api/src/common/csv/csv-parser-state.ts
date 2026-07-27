/** Mutable scanner state shared only within the CSV parser implementation. */
export interface CsvParserState {
  rows: string[][];
  row: string[];
  current: string;
  inQuotes: boolean;
}

function normalizeRow(row: string[]): string[] {
  return row.map((cell) => cell.trim());
}

/** Finalizes a non-empty row and resets field accumulation for the next record. */
export function consumeRowBreak(state: CsvParserState) {
  const normalized = normalizeRow([...state.row, state.current]);
  if (normalized.some((cell) => cell.length > 0)) {
    state.rows.push(normalized);
  }
  state.row = [];
  state.current = '';
}
