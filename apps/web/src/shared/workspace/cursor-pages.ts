/** Merge pages without duplicating rows when a record changes between requests. */
export function mergePage<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  const rows = new Map(previous.map((row) => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()];
}

export function pagePath(path: string, cursor?: string | null): string {
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);
  return `${path}${path.includes('?') ? '&' : '?'}${params}`;
}
