import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard.js';
import { createContext } from './auth.guard-test-support.js';

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
});
