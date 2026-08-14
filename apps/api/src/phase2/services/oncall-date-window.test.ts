import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { onCallDateWindowWhere } from './oncall-date-window.js';

describe('onCallDateWindowWhere', () => {
  it('uses inclusive overlap predicates when both bounds are present', () => {
    expect(
      onCallDateWindowWhere({ from: '2026-07-14T08:00:00.000Z', to: '2026-07-14T16:00:00.000Z' }),
    ).toEqual({
      AND: [
        { startTime: { lte: new Date('2026-07-14T16:00:00.000Z') } },
        { endTime: { gte: new Date('2026-07-14T08:00:00.000Z') } },
      ],
    });
  });

  it.each([
    [
      { from: '2026-07-14T08:00:00.000Z' },
      { endTime: { gte: new Date('2026-07-14T08:00:00.000Z') } },
    ],
    [
      { to: '2026-07-14T16:00:00.000Z' },
      { startTime: { lte: new Date('2026-07-14T16:00:00.000Z') } },
    ],
    [{}, {}],
  ])('handles a partial or absent date window', (query, where) => {
    expect(onCallDateWindowWhere(query)).toEqual(where);
  });

  it('preserves the invalid-range exception', () => {
    expect(() =>
      onCallDateWindowWhere({ from: '2026-07-14T16:00:00.000Z', to: '2026-07-14T08:00:00.000Z' }),
    ).toThrow(new BadRequestException('from must be on or before to.'));
  });
});
