import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

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
  describe('route policy classification', () => {
    it('allows public routes', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = ((metadataKey: string) =>
        metadataKey === 'isPublicRoute' ? true : undefined) as never;
      const guard = new RolesGuard(reflector);

      expect(guard.canActivate(createMockContext({ role: 'EMPLOYEE' }))).toBe(true);
    });

    it('allows authenticated routes with service-layer authorization', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => []) as never;
      reflector.get = ((metadataKey: string) =>
        metadataKey === 'isAuthenticatedRoute' ? true : undefined) as never;
      const guard = new RolesGuard(reflector);

      expect(guard.canActivate(createMockContext({ role: 'EMPLOYEE' }))).toBe(true);
    });

    it('fails closed for routes without an authorization policy', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => undefined) as never;
      reflector.get = (() => undefined) as never;
      const guard = new RolesGuard(reflector);

      expect(() => guard.canActivate(createMockContext({ role: 'EMPLOYEE' }))).toThrow(
        ForbiddenException,
      );
    });

    it('fails closed for empty @Roles metadata', () => {
      const reflector = new Reflector();
      reflector.getAllAndOverride = (() => []) as never;
      reflector.get = (() => undefined) as never;
      const guard = new RolesGuard(reflector);

      expect(() => guard.canActivate(createMockContext({ role: 'EMPLOYEE' }))).toThrow(
        ForbiddenException,
      );
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
