import { Logger } from '@nestjs/common';
import { Role } from '@cueq/database';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter.js';

const jose = vi.hoisted(() => {
  const jwks = Symbol('jwks');
  return {
    createRemoteJWKSet: vi.fn(() => jwks),
    jwtVerify: vi.fn(),
    jwks,
  };
});

vi.mock('jose', () => ({
  createRemoteJWKSet: jose.createRemoteJWKSet,
  jwtVerify: jose.jwtVerify,
}));

const ORIGINAL_ENV = {
  OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL,
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function configureOidc() {
  process.env.OIDC_ISSUER_URL = 'https://identity.cueq.local/realms/workforce/';
  process.env.OIDC_CLIENT_ID = 'cueq-api';
}

describe('OidcIdentityProviderAdapter', () => {
  beforeEach(() => {
    jose.createRemoteJWKSet.mockClear();
    jose.jwtVerify.mockReset();
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it('verifies configured tokens with the issuer JWKS and maps supported claims', async () => {
    configureOidc();
    const claims = {
      sub: 'person-123',
      email: 'person@cueq.local',
      realm_access: { roles: ['employee', 'Team Lead', 'admin'] },
      organizationUnitId: 42,
      customClaim: 'retained',
    };
    jose.jwtVerify.mockResolvedValue({ payload: claims });

    const adapter = new OidcIdentityProviderAdapter();
    await expect(adapter.verifyAccessToken('access-token')).resolves.toEqual({
      subject: 'person-123',
      email: 'person@cueq.local',
      role: Role.ADMIN,
      organizationUnitId: '42',
      claims,
    });

    expect(jose.createRemoteJWKSet).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://identity.cueq.local/realms/workforce/protocol/openid-connect/certs',
      }),
    );
    expect(jose.jwtVerify).toHaveBeenCalledWith('access-token', jose.jwks, {
      issuer: 'https://identity.cueq.local/realms/workforce/',
      audience: 'cueq-api',
    });
    expect(jose.createRemoteJWKSet.mock.invocationCallOrder[0]!).toBeLessThan(
      jose.jwtVerify.mock.invocationCallOrder[0]!,
    );
  });

  it('selects the highest supported realm role and defaults to employee', async () => {
    configureOidc();
    jose.jwtVerify
      .mockResolvedValueOnce({
        payload: {
          sub: 'person-admin',
          email: 'admin@cueq.local',
          realm_access: { roles: ['employee', 'hr', 'admin'] },
        },
      })
      .mockResolvedValueOnce({
        payload: {
          sub: 'person-default',
          email: 'default@cueq.local',
          realm_access: { roles: ['unsupported'] },
        },
      });
    const adapter = new OidcIdentityProviderAdapter();

    await expect(adapter.verifyAccessToken('admin-token')).resolves.toMatchObject({
      role: Role.ADMIN,
    });
    await expect(adapter.verifyAccessToken('default-token')).resolves.toMatchObject({
      role: Role.EMPLOYEE,
      organizationUnitId: undefined,
    });
  });

  it('fails closed before verification when OIDC configuration is incomplete', async () => {
    delete process.env.OIDC_ISSUER_URL;
    process.env.OIDC_CLIENT_ID = 'cueq-api';
    const adapter = new OidcIdentityProviderAdapter();

    await expect(adapter.verifyAccessToken('access-token')).rejects.toThrow(
      'OIDC is not configured.',
    );
    expect(jose.createRemoteJWKSet).not.toHaveBeenCalled();
    expect(jose.jwtVerify).not.toHaveBeenCalled();
  });

  it.each(['sub', 'email'] as const)('normalizes a missing required %s claim', async (claim) => {
    configureOidc();
    jose.jwtVerify.mockResolvedValue({
      payload: claim === 'sub' ? { email: 'person@cueq.local' } : { sub: 'person-missing-email' },
    });
    const adapter = new OidcIdentityProviderAdapter();

    await expect(adapter.verifyAccessToken('access-token')).rejects.toThrow(
      'OIDC token validation failed.',
    );
  });

  it('normalizes JWT failures without logging or exposing sensitive details', async () => {
    configureOidc();
    const sensitiveError = new Error('JWKS key rejected: secret-token-value');
    const logWarning = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jose.jwtVerify.mockRejectedValue(sensitiveError);
    const adapter = new OidcIdentityProviderAdapter();

    await expect(adapter.verifyAccessToken('access-token')).rejects.toThrow(
      'OIDC token validation failed.',
    );
    expect(logWarning).toHaveBeenCalledWith('oidc_token_validation_failed', 'Error');
    expect(logWarning).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('secret-token-value'),
    );
  });
});
