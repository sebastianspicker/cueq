import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function createMockContext(user?: { role?: string }) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as never;
}

describe('RolesGuard', () => {
  describe('when no roles are required', () => {
    it('allows access when no @Roles decorator is set', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => undefined) as never;
      const guard = new RolesGuard(reflector);

      expect(guard.canActivate(createMockContext({ role: 'EMPLOYEE' }))).toBe(true);
    });

    it('allows access when roles array is empty', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => []) as never;
      const guard = new RolesGuard(reflector);

      expect(guard.canActivate(createMockContext({ role: 'EMPLOYEE' }))).toBe(true);
    });
  });

  describe('when roles are required', () => {
    it('allows access when user has a matching role', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => ['HR', 'ADMIN']) as never;
      const guard = new RolesGuard(reflector);

      expect(guard.canActivate(createMockContext({ role: 'HR' }))).toBe(true);
    });

    it('throws ForbiddenException when user role does not match', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => ['HR', 'ADMIN']) as never;
      const guard = new RolesGuard(reflector);

      expect(() => guard.canActivate(createMockContext({ role: 'EMPLOYEE' }))).toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when user has no role', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => ['HR']) as never;
      const guard = new RolesGuard(reflector);

      expect(() => guard.canActivate(createMockContext({}))).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user is undefined', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => ['HR']) as never;
      const guard = new RolesGuard(reflector);

      expect(() => guard.canActivate(createMockContext())).toThrow(ForbiddenException);
    });
  });
});
