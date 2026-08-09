import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import { createContext } from './auth.guard-test-support.js';

describe('AuthGuard', () => {
  it('rejects oversized bearer tokens before verification', async () => {
    const verifyToken = vi.fn();
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(false),
      } as never,
      {
        verifyToken,
      } as never,
      {} as never,
    );

    const oversized = `Bearer ${'a'.repeat(4097)}`;
    await expect(
      guard.canActivate(
        createContext({
          headers: {
            authorization: oversized,
          },
        }),
      ),
    ).rejects.toThrowError(UnauthorizedException);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('rejects malformed bearer tokens containing control characters', async () => {
    const verifyToken = vi.fn();
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(false),
      } as never,
      {
        verifyToken,
      } as never,
      {} as never,
    );

    await expect(
      guard.canActivate(
        createContext({
          headers: {
            authorization: 'Bearer valid-token\u0000',
          },
        }),
      ),
    ).rejects.toThrowError(UnauthorizedException);
    expect(verifyToken).not.toHaveBeenCalled();
  });
});
