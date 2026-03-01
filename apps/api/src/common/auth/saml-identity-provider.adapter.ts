import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { Role } from '@cueq/database';
import type { IdentityProviderPort } from './identity-provider.port';
import type { AuthenticatedIdentity } from './auth.types';

const ROLE_MAP = new Map<string, Role>([
  ['employee', Role.EMPLOYEE],
  ['team_lead', Role.TEAM_LEAD],
  ['shift_planner', Role.SHIFT_PLANNER],
  ['hr', Role.HR],
  ['payroll', Role.PAYROLL],
  ['admin', Role.ADMIN],
  ['data_protection', Role.DATA_PROTECTION],
  ['works_council', Role.WORKS_COUNCIL],
]);

@Injectable()
export class SamlIdentityProviderAdapter implements IdentityProviderPort {
  private readonly issuer = process.env.SAML_ISSUER;
  private readonly audience = process.env.SAML_AUDIENCE;
  private readonly sharedSecret = process.env.SAML_JWT_SECRET;

  async verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
    if (!this.issuer || !this.audience || !this.sharedSecret) {
      throw new UnauthorizedException('SAML provider is not configured.');
    }

    try {
      const verified = await jwtVerify(token, new TextEncoder().encode(this.sharedSecret), {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['HS256', 'HS384', 'HS512'],
      });

      const claims = verified.payload as Record<string, unknown>;
      const subject = claims.sub ? String(claims.sub) : '';
      const email = claims.email ? String(claims.email) : '';
      if (!subject || !email) {
        throw new UnauthorizedException('Missing required SAML identity claims.');
      }

      const roleClaim = claims.role ? String(claims.role).toLowerCase() : 'employee';
      const mappedRole = ROLE_MAP.get(roleClaim) ?? Role.EMPLOYEE;

      return {
        subject,
        email,
        role: mappedRole,
        organizationUnitId: claims.organizationUnitId
          ? String(claims.organizationUnitId)
          : undefined,
        claims,
      };
    } catch {
      throw new UnauthorizedException('SAML token validation failed.');
    }
  }
}
