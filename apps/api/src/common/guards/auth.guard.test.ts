import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard';

function createContext(request: {
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
}): ExecutionContext {
  return {
    getClass: () => AuthGuard,
    getHandler: () => AuthGuard,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  it('accepts a single Bearer Authorization header', async () => {
    const request: {
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    } = {
      headers: {
        authorization: 'Bearer valid-token',
      },
    };
    const verifyToken = vi.fn().mockResolvedValue({
      subject: 'subject-1',
      email: 'employee@cueq.local',
      role: 'EMPLOYEE',
      claims: {},
    });
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(false),
      } as never,
      {
        verifyToken,
      } as never,
    );

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual({
      subject: 'subject-1',
      email: 'employee@cueq.local',
      role: 'EMPLOYEE',
      claims: {},
    });
  });

  it('rejects requests with multiple Authorization headers', async () => {
    const verifyToken = vi.fn();
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(false),
      } as never,
      {
        verifyToken,
      } as never,
    );

    await expect(
      guard.canActivate(
        createContext({
          headers: {
            authorization: ['Bearer token-a', 'Bearer token-b'],
          },
        }),
      ),
    ).rejects.toThrowError(UnauthorizedException);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('bypasses token verification for public routes', async () => {
    const verifyToken = vi.fn();
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(true),
      } as never,
      {
        verifyToken,
      } as never,
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

  it('rejects oversized bearer tokens before verification', async () => {
    const verifyToken = vi.fn();
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(false),
      } as never,
      {
        verifyToken,
      } as never,
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
