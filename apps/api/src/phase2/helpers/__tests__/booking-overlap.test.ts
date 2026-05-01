import { describe, expect, it } from 'vitest';
import { bookingOverlapWhere } from '../booking-overlap.helper';

describe('bookingOverlapWhere', () => {
  const personId = 'person-1';
  const startTime = new Date('2026-04-19T08:00:00.000Z');
  const endTime = new Date('2026-04-19T16:00:00.000Z');

  describe('with a finite end time', () => {
    it('restricts to the given personId', () => {
      const where = bookingOverlapWhere({ personId, startTime, endTime });
      expect(where.personId).toBe(personId);
    });

    it('requires startTime to be before the query endTime', () => {
      const where = bookingOverlapWhere({ personId, startTime, endTime });
      expect((where.startTime as { lt: Date }).lt).toEqual(endTime);
    });

    it('allows overlapping bookings with no end time (open-ended)', () => {
      const where = bookingOverlapWhere({ personId, startTime, endTime });
      const orClauses = where.OR as Array<Record<string, unknown>>;
      expect(orClauses.some((clause) => clause['endTime'] === null)).toBe(true);
    });

    it('allows overlapping bookings that end after the query startTime', () => {
      const where = bookingOverlapWhere({ personId, startTime, endTime });
      const orClauses = where.OR as Array<{ endTime?: { gt: Date } }>;
      const gtClause = orClauses.find((c) => c.endTime && 'gt' in c.endTime);
      expect(gtClause?.endTime?.gt).toEqual(startTime);
    });
  });

  describe('with a null end time (open-ended booking)', () => {
    it('restricts to the given personId', () => {
      const where = bookingOverlapWhere({ personId, startTime, endTime: null });
      expect(where.personId).toBe(personId);
    });

    it('does not include a startTime lt filter (no upper bound)', () => {
      const where = bookingOverlapWhere({ personId, startTime, endTime: null });
      expect(where.startTime).toBeUndefined();
    });

    it('includes OR for open-ended and future-ending bookings', () => {
      const where = bookingOverlapWhere({ personId, startTime, endTime: null });
      expect(where.OR).toBeDefined();
      const orClauses = where.OR as Array<Record<string, unknown>>;
      expect(orClauses.some((clause) => clause['endTime'] === null)).toBe(true);
    });
  });
});
