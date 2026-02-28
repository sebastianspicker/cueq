import { BadRequestException } from '@nestjs/common';
import { Role } from '@cueq/database';
import type { IdentityProviderPort } from './identity-provider.port';
import type { AuthenticatedIdentity } from './auth.types';
import { MOCK_IDENTITIES } from '../../test-utils/seed-ids';

const ROLE_MAP = new Map<string, Role>([
  ['EMPLOYEE', Role.EMPLOYEE],
  ['TEAM_LEAD', Role.TEAM_LEAD],
  ['SHIFT_PLANNER', Role.SHIFT_PLANNER],
  ['HR', Role.HR],
  ['PAYROLL', Role.PAYROLL],
  ['ADMIN', Role.ADMIN],
  ['DATA_PROTECTION', Role.DATA_PROTECTION],
  ['WORKS_COUNCIL', Role.WORKS_COUNCIL],
]);

function toIdentity(claims: Record<string, unknown>): AuthenticatedIdentity {
  const rawRole = String(claims.role ?? 'EMPLOYEE').toUpperCase();
  const role = ROLE_MAP.get(rawRole);

  if (!role) {
    throw new BadRequestException(`Unsupported mock role: ${rawRole}`);
  }

  const subject = String(claims.sub ?? '');
  const email = String(claims.email ?? '');

  if (!subject || !email) {
    throw new BadRequestException('Mock token must include sub and email claims.');
  }

  return {
    subject,
    email,
    role,
    organizationUnitId: claims.organizationUnitId ? String(claims.organizationUnitId) : undefined,
    claims,
  };
}

function parseEncodedPayload(token: string): Record<string, unknown> {
  if (!token.startsWith('mock.')) {
    throw new BadRequestException('Mock token must start with mock.');
  }

  const encoded = token.slice('mock.'.length);
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return parsed;
  } catch {
    throw new BadRequestException('Invalid encoded mock token payload.');
  }
}

const NAMED_TOKENS = new Map<string, Record<string, unknown>>([
  ['employee-token', MOCK_IDENTITIES.employee],
  ['lead-token', MOCK_IDENTITIES.lead],
  ['planner-token', MOCK_IDENTITIES.planner],
  ['hr-token', MOCK_IDENTITIES.hr],
  ['admin-token', MOCK_IDENTITIES.admin],
]);

export class MockIdentityProviderAdapter implements IdentityProviderPort {
  async verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
    const named = NAMED_TOKENS.get(token);
    if (named) {
      return toIdentity(named);
    }

    return toIdentity(parseEncodedPayload(token));
  }
}
