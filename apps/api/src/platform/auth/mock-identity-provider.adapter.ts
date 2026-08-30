/** Mock identity adapter for explicit local/test setups; AuthService rejects it in production. */
import { UnauthorizedException } from '@nestjs/common';
import type { IdentityProviderPort } from './identity-provider.port.js';
import type { AuthenticatedIdentity } from './auth.types.js';
import { MOCK_IDENTITIES } from './mock-identity-catalog.js';
import { parseRoleClaim } from './role-mapping.js';

function requiredClaim(claims: Record<string, unknown>, name: 'sub' | 'email'): string {
  const value = String(claims[name] ?? '');
  if (!value) {
    throw new UnauthorizedException('Mock token must include sub and email claims.');
  }

  return value;
}

function mockRole(claims: Record<string, unknown>) {
  const rawRole = String(claims.role ?? 'EMPLOYEE');
  const role = parseRoleClaim(rawRole);

  if (!role) {
    throw new UnauthorizedException(`Unsupported mock role: ${rawRole.toUpperCase()}`);
  }

  return role;
}

function toIdentity(claims: Record<string, unknown>): AuthenticatedIdentity {
  return {
    subject: requiredClaim(claims, 'sub'),
    email: requiredClaim(claims, 'email'),
    role: mockRole(claims),
    organizationUnitId: claims.organizationUnitId ? String(claims.organizationUnitId) : undefined,
    claims,
  };
}

function parseEncodedPayload(token: string): Record<string, unknown> {
  if (!token.startsWith('mock.')) {
    throw new UnauthorizedException('Mock token must start with mock.');
  }

  const encoded = token.slice('mock.'.length);
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return parsed;
  } catch {
    throw new UnauthorizedException('Invalid encoded mock token payload.');
  }
}

const NAMED_TOKENS = new Map<string, Record<string, unknown>>([
  ['employee-token', MOCK_IDENTITIES.employee],
  ['lead-token', MOCK_IDENTITIES.lead],
  ['planner-token', MOCK_IDENTITIES.planner],
  ['hr-token', MOCK_IDENTITIES.hr],
  ['admin-token', MOCK_IDENTITIES.admin],
]);

/** Decodes named or encoded mock tokens into the same identity contract as live providers. */
export class MockIdentityProviderAdapter implements IdentityProviderPort {
  async verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
    const named = NAMED_TOKENS.get(token);
    if (named) {
      return toIdentity(named);
    }

    return toIdentity(parseEncodedPayload(token));
  }
}
