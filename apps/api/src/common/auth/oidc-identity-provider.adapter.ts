import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Role } from '@cueq/database';
import type { IdentityProviderPort } from './identity-provider.port';
import type { AuthenticatedIdentity } from './auth.types';
import { selectHighestRoleClaim } from './role-mapping';

@Injectable()
export class OidcIdentityProviderAdapter implements IdentityProviderPort {
  private readonly issuer = process.env.OIDC_ISSUER_URL;
  private readonly audience = process.env.OIDC_CLIENT_ID;

  private readonly jwks = this.issuer
    ? createRemoteJWKSet(new URL(`${this.issuer.replace(/\/$/, '')}/protocol/openid-connect/certs`))
    : null;

  async verifyAccessToken(token: string): Promise<AuthenticatedIdentity> {
    if (!this.issuer || !this.audience || !this.jwks) {
      throw new UnauthorizedException('OIDC is not configured.');
    }

    try {
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });

      const claims = verified.payload as Record<string, unknown>;
      const email = claims.email ? String(claims.email) : '';
      const subject = claims.sub ? String(claims.sub) : '';

      if (!subject || !email) {
        throw new UnauthorizedException('Missing required identity claims.');
      }

      const realmAccess = claims.realm_access as { roles?: string[] } | undefined;
      const firstMapped = selectHighestRoleClaim(realmAccess?.roles ?? []) ?? Role.EMPLOYEE;

      return {
        subject,
        email,
        role: firstMapped,
        organizationUnitId: claims.organizationUnitId
          ? String(claims.organizationUnitId)
          : undefined,
        claims,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[OidcIdentityProviderAdapter] Token validation failed: ${message}`, error);
      throw new UnauthorizedException('OIDC token validation failed.');
    }
  }
}
