import { describe, expect, it } from 'vitest';
import { evaluatePlausibility } from '../plausibility';

describe('evaluatePlausibility – edge cases', () => {
  describe('empty and minimal inputs', () => {
    it('returns no issues for empty array', () => {
      expect(evaluatePlausibility([])).toEqual([]);
    });

    it('returns no issues for a single valid interval', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T16:00:00.000Z' },
      ]);
      expect(issues).toEqual([]);
    });
  });

  describe('missing end', () => {
    it('flags interval with no end property', () => {
      const issues = evaluatePlausibility([{ start: '2026-03-02T08:00:00.000Z' }]);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('MISSING_END');
      expect(issues[0]!.severity).toBe('ERROR');
      expect(issues[0]!.index).toBe(0);
    });

    it('flags interval with undefined end', () => {
      const issues = evaluatePlausibility([{ start: '2026-03-02T08:00:00.000Z', end: undefined }]);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('MISSING_END');
    });

    it('flags multiple missing ends and preserves index', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
        { start: '2026-03-02T13:00:00.000Z' },
        { start: '2026-03-02T14:00:00.000Z' },
      ]);
      const missingEndIssues = issues.filter((i) => i.code === 'MISSING_END');
      expect(missingEndIssues).toHaveLength(2);
      expect(missingEndIssues[0]!.index).toBe(1);
      expect(missingEndIssues[1]!.index).toBe(2);
    });
  });

  describe('negative and zero duration', () => {
    it('flags zero-duration interval (start === end)', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T08:00:00.000Z' },
      ]);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('NEGATIVE_DURATION');
      expect(issues[0]!.severity).toBe('ERROR');
    });

    it('flags negative-duration interval (end before start)', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T12:00:00.000Z', end: '2026-03-02T08:00:00.000Z' },
      ]);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('NEGATIVE_DURATION');
      expect(issues[0]!.context).toMatchObject({
        start: '2026-03-02T12:00:00.000Z',
        end: '2026-03-02T08:00:00.000Z',
      });
    });

    it('negative-duration intervals are excluded from overlap checks', () => {
      // Only valid intervals go into completeIntervals for overlap detection
      const issues = evaluatePlausibility([
        { start: '2026-03-02T12:00:00.000Z', end: '2026-03-02T08:00:00.000Z' },
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T16:00:00.000Z' },
      ]);
      expect(issues.some((i) => i.code === 'NEGATIVE_DURATION')).toBe(true);
      expect(issues.some((i) => i.code === 'OVERLAP')).toBe(false);
    });
  });

  describe('overlapping intervals', () => {
    it('detects simple overlap between two intervals', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
        { start: '2026-03-02T11:00:00.000Z', end: '2026-03-02T15:00:00.000Z' },
      ]);
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('OVERLAP');
    });

    it('no overlap for adjacent intervals (end === next start)', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
        { start: '2026-03-02T12:00:00.000Z', end: '2026-03-02T16:00:00.000Z' },
      ]);
      expect(issues).toEqual([]);
    });

    it('detects overlap regardless of input order', () => {
      // Second interval starts before first, but overlaps after sorting
      const issues = evaluatePlausibility([
        { start: '2026-03-02T10:00:00.000Z', end: '2026-03-02T14:00:00.000Z' },
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
      ]);
      expect(issues.some((i) => i.code === 'OVERLAP')).toBe(true);
    });

    it('detects containment overlap (one interval fully inside another)', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T16:00:00.000Z' },
        { start: '2026-03-02T10:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
      ]);
      expect(issues.some((i) => i.code === 'OVERLAP')).toBe(true);
    });

    it('detects multiple consecutive overlaps', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
        { start: '2026-03-02T11:00:00.000Z', end: '2026-03-02T15:00:00.000Z' },
        { start: '2026-03-02T14:00:00.000Z', end: '2026-03-02T18:00:00.000Z' },
      ]);
      const overlapIssues = issues.filter((i) => i.code === 'OVERLAP');
      expect(overlapIssues).toHaveLength(2);
    });

    it('no overlap for non-overlapping intervals', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T10:00:00.000Z' },
        { start: '2026-03-02T11:00:00.000Z', end: '2026-03-02T13:00:00.000Z' },
        { start: '2026-03-02T14:00:00.000Z', end: '2026-03-02T16:00:00.000Z' },
      ]);
      expect(issues).toEqual([]);
    });
  });

  describe('cross-midnight intervals', () => {
    it('valid cross-midnight interval produces no issues', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T22:00:00.000Z', end: '2026-03-03T06:00:00.000Z' },
      ]);
      expect(issues).toEqual([]);
    });

    it('detects overlap between cross-midnight and next-day interval', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T22:00:00.000Z', end: '2026-03-03T06:00:00.000Z' },
        { start: '2026-03-03T05:00:00.000Z', end: '2026-03-03T10:00:00.000Z' },
      ]);
      expect(issues.some((i) => i.code === 'OVERLAP')).toBe(true);
    });
  });

  describe('combined issues', () => {
    it('reports all issue types simultaneously', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T12:00:00.000Z' },
        { start: '2026-03-02T11:00:00.000Z', end: '2026-03-02T15:00:00.000Z' },
        { start: '2026-03-02T16:00:00.000Z' }, // missing end
        { start: '2026-03-02T18:00:00.000Z', end: '2026-03-02T17:00:00.000Z' }, // negative
      ]);
      expect(issues.some((i) => i.code === 'OVERLAP')).toBe(true);
      expect(issues.some((i) => i.code === 'MISSING_END')).toBe(true);
      expect(issues.some((i) => i.code === 'NEGATIVE_DURATION')).toBe(true);
    });
  });

  describe('very short intervals', () => {
    it('accepts a 1-millisecond interval as valid positive duration', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T08:00:00.001Z' },
      ]);
      expect(issues).toEqual([]);
    });
  });

  describe('multi-day intervals', () => {
    it('accepts a 48-hour interval as valid', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-04T08:00:00.000Z' },
      ]);
      expect(issues).toEqual([]);
    });

    it('detects overlap between a long interval and a short one inside it', () => {
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-04T08:00:00.000Z' },
        { start: '2026-03-03T10:00:00.000Z', end: '2026-03-03T12:00:00.000Z' },
      ]);
      expect(issues.some((i) => i.code === 'OVERLAP')).toBe(true);
    });
  });

  describe('non-adjacent overlap detection', () => {
    it('detects overlap between consecutive sorted pairs only', () => {
      // A=[08-16], B=[09-10] (inside A), C=[11-15] (inside A, but not overlapping B)
      // Sweep-line checks: A-B overlap detected, B-C no overlap (B ends at 10, C starts at 11)
      // Note: A-C overlap exists but is not reported (known limitation of consecutive-pair check)
      const issues = evaluatePlausibility([
        { start: '2026-03-02T08:00:00.000Z', end: '2026-03-02T16:00:00.000Z' },
        { start: '2026-03-02T09:00:00.000Z', end: '2026-03-02T10:00:00.000Z' },
        { start: '2026-03-02T11:00:00.000Z', end: '2026-03-02T15:00:00.000Z' },
      ]);
      // At minimum, the A-B overlap is detected
      expect(issues.some((i) => i.code === 'OVERLAP')).toBe(true);
    });
  });
});
