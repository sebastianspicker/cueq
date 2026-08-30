/** Token consumers shared by the stateful CSV parser to keep delimiter and newline rules consistent. */
import { consumeRowBreak, type CsvParserState } from './csv-parser-state.js';

/** Consumes a delimiter only outside quoted fields. */
export function consumeDelimiter(state: CsvParserState, char: string): boolean {
  if (char !== ',' || state.inQuotes) return false;
  state.row.push(state.current);
  state.current = '';
  return true;
}

/** Consumes LF, CR, and CRLF only when they terminate an unquoted record. */
export function consumeLineBreak(
  state: CsvParserState,
  char: string,
  next: string | undefined,
): number | null {
  const isLineBreak = char === '\n' || char === '\r';
  if (!isLineBreak || state.inQuotes) return null;
  consumeRowBreak(state);
  return char === '\r' && next === '\n' ? 1 : 0;
}
