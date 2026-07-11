import { consumeRowBreak, type CsvParserState } from './csv-parser-state';

export function consumeDelimiter(state: CsvParserState, char: string): boolean {
  if (char !== ',' || state.inQuotes) return false;
  state.row.push(state.current);
  state.current = '';
  return true;
}

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
