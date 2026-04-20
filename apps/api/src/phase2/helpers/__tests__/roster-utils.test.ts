import { describe, expect, it } from 'vitest';
import { assignedPersonIdsForShift } from '../roster-utils';

describe('assignedPersonIdsForShift', () => {
  it('returns only assignment IDs when personId is null', () => {
    const result = assignedPersonIdsForShift({
      personId: null,
      assignments: [{ personId: 'p1' }, { personId: 'p2' }],
    });
    expect(result).toEqual(['p1', 'p2']);
  });

  it('includes legacy personId when not already in assignments', () => {
    const result = assignedPersonIdsForShift({
      personId: 'p3',
      assignments: [{ personId: 'p1' }, { personId: 'p2' }],
    });
    expect(result).toContain('p3');
    expect(result).toHaveLength(3);
  });

  it('does not duplicate legacy personId when already in assignments', () => {
    const result = assignedPersonIdsForShift({
      personId: 'p1',
      assignments: [{ personId: 'p1' }, { personId: 'p2' }],
    });
    expect(result.filter((id) => id === 'p1')).toHaveLength(1);
    expect(result).toHaveLength(2);
  });

  it('returns single-element array when only personId is set', () => {
    const result = assignedPersonIdsForShift({ personId: 'p1', assignments: [] });
    expect(result).toEqual(['p1']);
  });

  it('returns empty array when both personId is null and assignments are empty', () => {
    const result = assignedPersonIdsForShift({ personId: null, assignments: [] });
    expect(result).toEqual([]);
  });
});
