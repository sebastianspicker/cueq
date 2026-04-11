function normalizeRow(row: string[]): string[] {
  return row.map((cell) => cell.trim());
}

function pushRow(rows: string[][], row: string[]) {
  const normalized = normalizeRow(row);
  if (normalized.every((cell) => cell.length === 0)) {
    return;
  }
  rows.push(normalized);
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    if (!char) {
      continue;
    }

    if (char === '"') {
      const next = csv[index + 1];
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      row.push(current);
      current = '';
      pushRow(rows, row);
      row = [];
      if (char === '\r' && csv[index + 1] === '\n') {
        index += 1;
      }
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error('CSV parse error: unmatched quote in input.');
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    pushRow(rows, row);
  }

  return rows;
}

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
