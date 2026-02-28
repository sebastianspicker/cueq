import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from './auth.types';
import type { IdentityProviderPort } from './identity-provider.port';
import { MockIdentityProviderAdapter } from './mock-identity-provider.adapter';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter';

@Injectable()
export class AuthService {
  private readonly identityProvider: IdentityProviderPort;

  constructor(@Inject(OidcIdentityProviderAdapter) oidcProvider: OidcIdentityProviderAdapter) {
    const authMode = process.env.AUTH_MODE;
    const useOidc = authMode === 'oidc' || (!authMode && Boolean(process.env.OIDC_ISSUER_URL));

    this.identityProvider = useOidc ? oidcProvider : new MockIdentityProviderAdapter();
  }

  verifyToken(token: string): Promise<AuthenticatedIdentity> {
    return this.identityProvider.verifyAccessToken(token);
  }
}
