/** SAML bridge adapter that verifies shared-secret JWTs carrying mapped identity claims. */
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { Role } from '@cueq/database';
import type { IdentityProviderPort } from './identity-provider.port.js';
import type { AuthenticatedIdentity } from './auth.types.js';
import { parseRoleClaim } from './role-mapping.js';

/** Converts verified bridge-JWT claims into the shared identity contract. */
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

      const mappedRole = parseRoleClaim(claims.role) ?? Role.EMPLOYEE;

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
