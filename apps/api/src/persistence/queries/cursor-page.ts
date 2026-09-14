import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '@cueq/database';

const CursorSchema = z
  .object({
    version: z.literal(1),
    field: z.string(),
    at: z.string().datetime(),
    id: z.string().min(1).max(200),
  })
  .strict();

function parseCursor(field: string, cursor: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 1000) throw new Error();
    const parsed = CursorSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    if (parsed.field !== field) throw new Error();
    return parsed;
  } catch {
    throw new BadRequestException('Invalid pagination cursor.');
  }
}

/** SQL timestamp and identifier expressions must be static trusted SQL fragments. */
export function cursorSqlWhere(
  field: string,
  timestamp: Prisma.Sql,
  id: Prisma.Sql,
  cursor?: string,
) {
  if (!cursor) return Prisma.sql`TRUE`;
  const parsed = parseCursor(field, cursor);
  return Prisma.sql`(${timestamp}, ${id}) > (${new Date(parsed.at)}, ${parsed.id})`;
}

export function cursorWhere(field: string, cursor?: string, direction: 'asc' | 'desc' = 'asc') {
  if (!cursor) return {};
  const parsed = parseCursor(field, cursor);
  const comparison = direction === 'asc' ? 'gt' : 'lt';
  return {
    OR: [
      { [field]: { [comparison]: new Date(parsed.at) } },
      { [field]: new Date(parsed.at), id: { [comparison]: parsed.id } },
    ],
  };
}

export function cursorPage<T extends { id: string }, R>(
  rows: T[],
  limit: number,
  field: string,
  timestamp: (row: T) => Date,
  map: (row: T) => R,
) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > limit && last
      ? Buffer.from(
          JSON.stringify({
            version: 1,
            field,
            at: timestamp(last).toISOString(),
            id: last.id,
          }),
        ).toString('base64url')
      : null;
  return { items: items.map(map), nextCursor };
}
