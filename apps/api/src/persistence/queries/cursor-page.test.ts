import { describe, expect, it } from 'vitest';
import { cursorPage, cursorWhere } from './cursor-page.js';

describe('timestamp and ID cursor pages', () => {
  it('continues across equal timestamps without dropping or repeating records', () => {
    const rows = ['a', 'b', 'c'].map((id) => ({ id, timestamp: new Date('2026-09-07T00:00:00Z') }));
    const first = cursorPage(
      rows,
      2,
      'timestamp',
      (row) => row.timestamp,
      (row) => row,
    );
    expect(first.items.map((row) => row.id)).toEqual(['a', 'b']);
    expect(cursorWhere('timestamp', first.nextCursor ?? undefined)).toEqual({
      OR: [
        { timestamp: { gt: rows[0]!.timestamp } },
        { timestamp: rows[0]!.timestamp, id: { gt: 'b' } },
      ],
    });
    expect(
      cursorPage(
        rows.slice(2),
        2,
        'timestamp',
        (row) => row.timestamp,
        (row) => row,
      ).nextCursor,
    ).toBeNull();
  });
  it('rejects malformed and wrong-sort cursors', () => {
    for (const value of [
      '%',
      'e30',
      Buffer.from(
        JSON.stringify({ version: 1, field: 'timestamp', at: 'invalid', id: 'a' }),
      ).toString('base64url'),
    ]) {
      expect(() => cursorWhere('timestamp', value)).toThrow('Invalid pagination cursor');
    }
    const rows = ['a', 'b'].map((id) => ({ id, timestamp: new Date(0) }));
    const page = cursorPage(
      rows,
      1,
      'timestamp',
      (row) => row.timestamp,
      (row) => row,
    );
    expect(() => cursorWhere('startTime', page.nextCursor ?? undefined)).toThrow();
    expect(cursorWhere('timestamp', page.nextCursor ?? undefined, 'desc')).toHaveProperty(
      'OR.1.id.lt',
      'a',
    );
  });
});
