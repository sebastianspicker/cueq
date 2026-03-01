import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from './auth.types';
import type { IdentityProviderPort } from './identity-provider.port';
import { MockIdentityProviderAdapter } from './mock-identity-provider.adapter';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter';
import { SamlIdentityProviderAdapter } from './saml-identity-provider.adapter';

@Injectable()
export class AuthService {
  private readonly identityProvider: IdentityProviderPort;

  constructor(
    @Inject(OidcIdentityProviderAdapter) oidcProvider: OidcIdentityProviderAdapter,
    @Inject(SamlIdentityProviderAdapter) samlProvider: SamlIdentityProviderAdapter,
  ) {
    const authProvider = (process.env.AUTH_PROVIDER ?? '').toLowerCase();
    if (authProvider === 'oidc') {
      this.identityProvider = oidcProvider;
      return;
    }
    if (authProvider === 'saml') {
      this.identityProvider = samlProvider;
      return;
    }
    if (authProvider === 'mock') {
      this.identityProvider = new MockIdentityProviderAdapter();
      return;
    }

    const authMode = (process.env.AUTH_MODE ?? '').toLowerCase();
    const useOidc = authMode === 'oidc' || (!authMode && Boolean(process.env.OIDC_ISSUER_URL));
    this.identityProvider = useOidc ? oidcProvider : new MockIdentityProviderAdapter();
  }

  verifyToken(token: string): Promise<AuthenticatedIdentity> {
    return this.identityProvider.verifyAccessToken(token);
  }
}
