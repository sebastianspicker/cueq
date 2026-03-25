import { Role } from '@cueq/database';
import { describe, expect, it } from 'vitest';
import { parseRoleClaim, selectHighestRoleClaim } from './role-mapping';

describe('role mapping', () => {
  it('normalizes role claims with case and separator variants', () => {
    expect(parseRoleClaim('Team Lead')).toBe(Role.TEAM_LEAD);
    expect(parseRoleClaim('data-protection')).toBe(Role.DATA_PROTECTION);
    expect(parseRoleClaim('WORKS_COUNCIL')).toBe(Role.WORKS_COUNCIL);
  });

  it('returns null for unsupported role values', () => {
    expect(parseRoleClaim('student-assistant')).toBeNull();
  });

  it('selects highest-priority mapped role from multi-role claims', () => {
    expect(selectHighestRoleClaim(['employee', 'team_lead', 'hr'])).toBe(Role.HR);
    expect(selectHighestRoleClaim(['works_council', 'employee'])).toBe(Role.WORKS_COUNCIL);
  });

  it('returns null when no mapped roles exist in the list', () => {
    expect(selectHighestRoleClaim(['foo', 'bar'])).toBeNull();
  });
});
