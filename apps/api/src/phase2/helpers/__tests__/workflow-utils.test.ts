import { describe, expect, it } from 'vitest';
import { Role, WorkflowStatus, WorkflowType } from '@cueq/database';
import type { Prisma } from '@cueq/database';
import {
  addHours,
  appendTrail,
  asRoleArray,
  isRoleAllowedForAllWorkflowTypes,
  isRoleAllowedForType,
  isWorkflowFinal,
  toIso,
} from '../workflow-utils';

describe('toIso', () => {
  it('formats a Date as ISO 8601', () => {
    const d = new Date('2026-04-19T10:00:00.000Z');
    expect(toIso(d)).toBe('2026-04-19T10:00:00.000Z');
  });
});

describe('addHours', () => {
  it('adds positive hours correctly', () => {
    const base = new Date('2026-04-19T08:00:00.000Z');
    const result = addHours(base, 48);
    expect(result.toISOString()).toBe('2026-04-21T08:00:00.000Z');
  });

  it('adds fractional hours', () => {
    const base = new Date('2026-04-19T08:00:00.000Z');
    const result = addHours(base, 0.5);
    expect(result.getTime() - base.getTime()).toBe(30 * 60 * 1000);
  });

  it('subtracts hours with negative value', () => {
    const base = new Date('2026-04-19T10:00:00.000Z');
    const result = addHours(base, -2);
    expect(result.toISOString()).toBe('2026-04-19T08:00:00.000Z');
  });
});

describe('asRoleArray', () => {
  it('returns valid Role values from a JSON array', () => {
    const result = asRoleArray([Role.HR, Role.ADMIN]);
    expect(result).toEqual([Role.HR, Role.ADMIN]);
  });

  it('filters out non-Role strings', () => {
    const result = asRoleArray(['HR', 'INVALID_ROLE', 'ADMIN']);
    expect(result).toContain(Role.HR);
    expect(result).toContain(Role.ADMIN);
    expect(result).not.toContain('INVALID_ROLE');
  });

  it('returns empty array for null', () => {
    expect(asRoleArray(null)).toEqual([]);
  });

  it('returns empty array for non-array values', () => {
    expect(asRoleArray('HR')).toEqual([]);
    expect(asRoleArray(42)).toEqual([]);
    expect(asRoleArray({ role: 'HR' })).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(asRoleArray([])).toEqual([]);
  });
});

describe('appendTrail', () => {
  it('appends a new approver to an existing trail', () => {
    const result = appendTrail(['approver-1', 'approver-2'], 'approver-3');
    expect(result).toEqual(['approver-1', 'approver-2', 'approver-3']);
  });

  it('does not duplicate an approver already in the trail', () => {
    const result = appendTrail(['approver-1'], 'approver-1');
    expect(result).toEqual(['approver-1']);
  });

  it('starts a new trail from null', () => {
    const result = appendTrail(null, 'approver-1');
    expect(result).toEqual(['approver-1']);
  });

  it('returns existing trail unchanged when no approverId given', () => {
    const result = appendTrail(['approver-1'], undefined);
    expect(result).toEqual(['approver-1']);
  });

  it('filters non-string values from an existing trail', () => {
    const result = appendTrail(['valid', 42, null, 'also-valid'] as Prisma.JsonValue, 'new');
    expect(result).toEqual(['valid', 'also-valid', 'new']);
  });
});

describe('isWorkflowFinal', () => {
  it.each([WorkflowStatus.APPROVED, WorkflowStatus.REJECTED, WorkflowStatus.CANCELLED])(
    'returns true for terminal status %s',
    (status) => {
      expect(isWorkflowFinal(status)).toBe(true);
    },
  );

  it('returns false for PENDING status', () => {
    expect(isWorkflowFinal(WorkflowStatus.PENDING)).toBe(false);
  });

  it('returns false for ESCALATED status', () => {
    expect(isWorkflowFinal(WorkflowStatus.ESCALATED)).toBe(false);
  });
});

describe('isRoleAllowedForType', () => {
  it('allows TEAM_LEAD for LEAVE_REQUEST', () => {
    expect(isRoleAllowedForType(Role.TEAM_LEAD, WorkflowType.LEAVE_REQUEST)).toBe(true);
  });

  it('allows HR for all workflow types', () => {
    for (const type of Object.values(WorkflowType)) {
      expect(isRoleAllowedForType(Role.HR, type)).toBe(true);
    }
  });

  it('allows ADMIN for all workflow types', () => {
    for (const type of Object.values(WorkflowType)) {
      expect(isRoleAllowedForType(Role.ADMIN, type)).toBe(true);
    }
  });

  it('allows SHIFT_PLANNER only for SHIFT_SWAP', () => {
    expect(isRoleAllowedForType(Role.SHIFT_PLANNER, WorkflowType.SHIFT_SWAP)).toBe(true);
    expect(isRoleAllowedForType(Role.SHIFT_PLANNER, WorkflowType.LEAVE_REQUEST)).toBe(false);
  });

  it('denies EMPLOYEE for all workflow types', () => {
    for (const type of Object.values(WorkflowType)) {
      expect(isRoleAllowedForType(Role.EMPLOYEE, type)).toBe(false);
    }
  });
});

describe('isRoleAllowedForAllWorkflowTypes', () => {
  it('returns true for HR', () => {
    expect(isRoleAllowedForAllWorkflowTypes(Role.HR)).toBe(true);
  });

  it('returns true for ADMIN', () => {
    expect(isRoleAllowedForAllWorkflowTypes(Role.ADMIN)).toBe(true);
  });

  it('returns false for TEAM_LEAD (not allowed for SHIFT_SWAP)', () => {
    expect(isRoleAllowedForAllWorkflowTypes(Role.TEAM_LEAD)).toBe(false);
  });

  it('returns false for EMPLOYEE', () => {
    expect(isRoleAllowedForAllWorkflowTypes(Role.EMPLOYEE)).toBe(false);
  });
});
