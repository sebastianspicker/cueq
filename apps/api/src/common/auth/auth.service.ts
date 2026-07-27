/** Selects the configured identity-provider adapter and forbids mock authentication in production. */
import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from './auth.types.js';
import type { IdentityProviderPort } from './identity-provider.port.js';
import { MockIdentityProviderAdapter } from './mock-identity-provider.adapter.js';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter.js';
import { SamlIdentityProviderAdapter } from './saml-identity-provider.adapter.js';

function isProductionRuntime(): boolean {
  return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
}

/** Central credential-verification facade used by the HTTP authentication guard. */
@Injectable()
export class AuthService {
  private readonly identityProvider: IdentityProviderPort;

  constructor(
    @Inject(OidcIdentityProviderAdapter) oidcProvider: OidcIdentityProviderAdapter,
    @Inject(SamlIdentityProviderAdapter) samlProvider: SamlIdentityProviderAdapter,
  ) {
    let selectedProvider: IdentityProviderPort;
    const authProvider = (process.env.AUTH_PROVIDER ?? '').trim().toLowerCase();
    if (authProvider) {
      if (authProvider === 'oidc') {
        selectedProvider = oidcProvider;
      } else if (authProvider === 'saml') {
        selectedProvider = samlProvider;
      } else if (authProvider === 'mock') {
        selectedProvider = new MockIdentityProviderAdapter();
      } else {
        throw new Error(
          `Unsupported AUTH_PROVIDER value: ${authProvider}. Expected one of: mock, oidc, saml.`,
        );
      }
    } else {
      const authMode = (process.env.AUTH_MODE ?? '').trim().toLowerCase();
      if (authMode && authMode !== 'mock' && authMode !== 'oidc') {
        throw new Error(`Unsupported AUTH_MODE value: ${authMode}. Expected one of: mock, oidc.`);
      }
      const useOidc = authMode === 'oidc' || (!authMode && Boolean(process.env.OIDC_ISSUER_URL));
      selectedProvider = useOidc ? oidcProvider : new MockIdentityProviderAdapter();
    }

    const usingMockProvider = selectedProvider instanceof MockIdentityProviderAdapter;
    if (usingMockProvider && isProductionRuntime()) {
      throw new Error(
        'Insecure auth configuration: mock auth provider is disabled in production. ' +
          'Set AUTH_PROVIDER to oidc or saml.',
      );
    }

    this.identityProvider = selectedProvider;
  }

  verifyToken(token: string): Promise<AuthenticatedIdentity> {
    return this.identityProvider.verifyAccessToken(token);
  }
}
