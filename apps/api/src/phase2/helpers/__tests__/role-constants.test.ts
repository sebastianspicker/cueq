import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@cueq/database';
import { assertCanActForPerson, assertHrLikeRole } from '../role-constants';
import type { AuthenticatedIdentity } from '../../../common/auth/auth.types';

function makeUser(role: Role, id = 'user-1'): AuthenticatedIdentity {
  return {
    subject: id,
    email: `${id}@example.com`,
    role,
    personId: id,
    organizationUnitId: 'ou-1',
    claims: {},
  };
}

describe('assertHrLikeRole', () => {
  it('does not throw for HR', () => {
    expect(() => assertHrLikeRole(makeUser(Role.HR))).not.toThrow();
  });

  it('does not throw for ADMIN', () => {
    expect(() => assertHrLikeRole(makeUser(Role.ADMIN))).not.toThrow();
  });

  it('throws ForbiddenException for EMPLOYEE', () => {
    expect(() => assertHrLikeRole(makeUser(Role.EMPLOYEE))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for TEAM_LEAD', () => {
    expect(() => assertHrLikeRole(makeUser(Role.TEAM_LEAD))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for SHIFT_PLANNER', () => {
    expect(() => assertHrLikeRole(makeUser(Role.SHIFT_PLANNER))).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for WORKS_COUNCIL', () => {
    expect(() => assertHrLikeRole(makeUser(Role.WORKS_COUNCIL))).toThrow(ForbiddenException);
  });
});

describe('assertCanActForPerson', () => {
  it('allows any role when actor and target are the same person', () => {
    expect(() =>
      assertCanActForPerson(makeUser(Role.EMPLOYEE, 'p1'), 'p1', 'p1'),
    ).not.toThrow();
  });

  it('allows HR to act cross-person', () => {
    expect(() =>
      assertCanActForPerson(makeUser(Role.HR, 'p1'), 'p1', 'p2'),
    ).not.toThrow();
  });

  it('allows ADMIN to act cross-person', () => {
    expect(() =>
      assertCanActForPerson(makeUser(Role.ADMIN, 'p1'), 'p1', 'p2'),
    ).not.toThrow();
  });

  it('throws ForbiddenException when EMPLOYEE tries to act for another person', () => {
    expect(() =>
      assertCanActForPerson(makeUser(Role.EMPLOYEE, 'p1'), 'p1', 'p2'),
    ).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when TEAM_LEAD tries to act for another person', () => {
    expect(() =>
      assertCanActForPerson(makeUser(Role.TEAM_LEAD, 'p1'), 'p1', 'p2'),
    ).toThrow(ForbiddenException);
  });
});
