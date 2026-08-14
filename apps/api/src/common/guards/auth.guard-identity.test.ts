import { ForbiddenException, Logger } from '@nestjs/common';
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
