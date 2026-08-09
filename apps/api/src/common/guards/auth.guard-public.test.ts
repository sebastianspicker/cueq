import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import { createContext } from './auth.guard-test-support.js';

describe('AuthGuard', () => {
  it('bypasses token verification for public routes', async () => {
    const verifyToken = vi.fn();
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(true),
      } as never,
      {
        verifyToken,
      } as never,
      {} as never,
    );

    await expect(
      guard.canActivate(
        createContext({
          headers: {},
        }),
      ),
    ).resolves.toBe(true);
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
