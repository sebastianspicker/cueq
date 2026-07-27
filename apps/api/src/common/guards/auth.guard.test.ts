import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard.js';

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
    const prisma = {
      person: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({
          id: 'person-1',
          email: 'employee@cueq.local',
          role: 'EMPLOYEE',
          organizationUnitId: 'ou-1',
        }),
      },
    };
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(false),
      } as never,
      {
        verifyToken,
      } as never,
      prisma as never,
    );

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('valid-token');
    expect(request.user).toEqual({
      subject: 'subject-1',
      email: 'employee@cueq.local',
      personId: 'person-1',
      role: 'EMPLOYEE',
      organizationUnitId: 'ou-1',
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
      {} as never,
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

  it('uses persisted role and organization unit as the request auth context', async () => {
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
      role: 'HR',
      organizationUnitId: 'ou-token',
      claims: {},
    });
    const guard = new AuthGuard(
      {
        getAllAndOverride: vi.fn().mockReturnValue(false),
      } as never,
      {
        verifyToken,
      } as never,
      {
        person: {
          findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({
            id: 'person-1',
            email: 'employee@cueq.local',
            role: 'EMPLOYEE',
            organizationUnitId: 'ou-db',
          }),
        },
      } as never,
    );

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toMatchObject({
      personId: 'person-1',
      role: 'EMPLOYEE',
      organizationUnitId: 'ou-db',
    });
  });

  it('preserves explicit forbidden identity mismatches', async () => {
    const logger = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const guard = new AuthGuard(
      { getAllAndOverride: vi.fn().mockReturnValue(false) } as never,
      {
        verifyToken: vi.fn().mockResolvedValue({
          subject: 'subject-1',
          email: 'claimed@cueq.local',
          role: 'ADMIN',
          claims: {},
        }),
      } as never,
      {
        person: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'subject-1',
            email: 'persisted@cueq.local',
            role: 'EMPLOYEE',
            organizationUnitId: 'ou-db',
          }),
        },
      } as never,
    );

    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Bearer token' } })),
    ).rejects.toThrowError(ForbiddenException);
    expect(logger).not.toHaveBeenCalled();
  });

  it('maps other resolution failures to a stable external message and safe log event', async () => {
    const logger = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const guard = new AuthGuard(
      { getAllAndOverride: vi.fn().mockReturnValue(false) } as never,
      {
        verifyToken: vi.fn().mockResolvedValue({
          subject: 'subject-1',
          email: 'employee@cueq.local',
          role: 'EMPLOYEE',
          claims: {},
        }),
      } as never,
      {
        person: {
          findUnique: vi.fn().mockRejectedValue(new Error('database connection secret detail')),
        },
      } as never,
    );

    await expect(
      guard.canActivate(createContext({ headers: { authorization: 'Bearer token' } })),
    ).rejects.toMatchObject({
      message: 'Authenticated person could not be resolved.',
    });
    expect(logger).toHaveBeenCalledWith({
      event: 'auth_identity_resolution_failed',
      errorClass: 'Error',
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain('database connection secret detail');
  });
});
