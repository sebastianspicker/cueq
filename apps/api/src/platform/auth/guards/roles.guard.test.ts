import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AUTHENTICATED_ROUTE_METADATA } from '../decorators/authenticated.decorator.js';
import { ALLOWED_ROLES_METADATA } from '../decorators/roles.decorator.js';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public.decorator.js';
import { RolesGuard } from './roles.guard.js';

class TestController {}

type TestContext = {
  getHandler: () => () => undefined;
  getClass: () => typeof TestController;
  switchToHttp: () => { getRequest: () => { user: { role: 'ADMIN' | 'EMPLOYEE' } } };
};

function guardFor(
  policy: 'public' | 'authenticated' | 'allowed' | 'wrong' | 'unannotated',
): RolesGuard & { context: TestContext } {
  const handler = () => undefined;
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === PUBLIC_ROUTE_METADATA) return policy === 'public';
      if (key === ALLOWED_ROLES_METADATA)
        return policy === 'allowed' || policy === 'wrong' ? ['ADMIN'] : undefined;
      return undefined;
    },
    get: (key: string) => key === AUTHENTICATED_ROUTE_METADATA && policy === 'authenticated',
  };
  const context = {
    getHandler: () => handler,
    getClass: () => TestController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: { role: (policy === 'wrong' ? 'EMPLOYEE' : 'ADMIN') as 'ADMIN' | 'EMPLOYEE' },
      }),
    }),
  };
  return Object.assign(new RolesGuard(reflector as never), { context });
}

describe('RolesGuard', () => {
  it('applies public, authenticated, allowed-role, wrong-role, and fail-closed policies', () => {
    for (const policy of ['public', 'authenticated', 'allowed'] as const) {
      const guard = guardFor(policy);
      expect(guard.canActivate(guard.context as never)).toBe(true);
    }
    for (const policy of ['wrong', 'unannotated'] as const) {
      const guard = guardFor(policy);
      expect(() => guard.canActivate(guard.context as never)).toThrow(ForbiddenException);
    }
  });
});
