function normalizeRow(row) {
  return row.map((cell) => String(cell).trim());
}

function pushRow(rows, row) {
  const normalized = normalizeRow(row);
  if (normalized.every((cell) => cell.length === 0)) {
    return;
  }
  rows.push(normalized);
}

function consumeQuote(csv, index, state) {
  if (csv[index] !== '"') return null;
  if (state.inQuotes && csv[index + 1] === '"') {
    state.current += '"';
    return index + 1;
  }
  state.inQuotes = !state.inQuotes;
  return index;
}

function consumeRecordBreak(csv, index, state, rows) {
  const char = csv[index];
  if (state.inQuotes || (char !== '\n' && char !== '\r')) return null;
  state.row.push(state.current);
  state.current = '';
  pushRow(rows, state.row);
  state.row = [];
  return char === '\r' && csv[index + 1] === '\n' ? index + 1 : index;
}

function parseCsvRows(csv) {
  const rows = [];
  const state = { row: [], current: '', inQuotes: false };

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const quoteIndex = consumeQuote(csv, index, state);
    if (quoteIndex !== null) {
      index = quoteIndex;
      continue;
    }

    if (char === ',' && !state.inQuotes) {
      state.row.push(state.current);
      state.current = '';
      continue;
    }

    const breakIndex = consumeRecordBreak(csv, index, state, rows);
    if (breakIndex !== null) {
      index = breakIndex;
      continue;
    }

    state.current += char;
  }

  if (state.inQuotes) {
    throw new Error('CSV parse error: unmatched quote in input.');
  }

  if (state.current.length > 0 || state.row.length > 0) {
    state.row.push(state.current);
    pushRow(rows, state.row);
  }

  return rows;
}

/** Parses RFC-style quoted CSV while rejecting ambiguous headers before import validation. */
export function parseCsvRecords(csv) {
  const parsedRows = parseCsvRows(csv);
  if (parsedRows.length < 2) {
    return { headers: [], rows: [] };
  }

  const [headerRow, ...dataRows] = parsedRows;
  const headers = [...headerRow].map((header) => String(header).trim());
  if (headers[0]) {
    headers[0] = headers[0].replace(/^\ufeff/u, '');
  }
  if (headers.some((header) => header.length === 0)) {
    throw new Error('CSV parse error: header names must be non-empty.');
  }
  if (new Set(headers).size !== headers.length) {
    throw new Error('CSV parse error: duplicate header names are not allowed.');
  }

  return {
    headers,
    rows: dataRows.map((values) =>
      Object.fromEntries(headers.map((header, idx) => [header, values[idx] ?? ''])),
    ),
  };
}
