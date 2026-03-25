import { Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from './auth.types';
import type { IdentityProviderPort } from './identity-provider.port';
import { MockIdentityProviderAdapter } from './mock-identity-provider.adapter';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter';
import { SamlIdentityProviderAdapter } from './saml-identity-provider.adapter';

function isProductionRuntime(): boolean {
  return (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
}

@Injectable()
export class AuthService {
  private readonly identityProvider: IdentityProviderPort;

  constructor(
    @Inject(OidcIdentityProviderAdapter) oidcProvider: OidcIdentityProviderAdapter,
    @Inject(SamlIdentityProviderAdapter) samlProvider: SamlIdentityProviderAdapter,
  ) {
    const allowMockInProduction =
      (process.env.AUTH_ALLOW_INSECURE_MOCK ?? '').toLowerCase() === 'true';
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
    if (usingMockProvider && isProductionRuntime() && !allowMockInProduction) {
      throw new Error(
        'Insecure auth configuration: mock auth provider is disabled in production. ' +
          'Set AUTH_PROVIDER to oidc/saml or explicitly opt in via AUTH_ALLOW_INSECURE_MOCK=true.',
      );
    }

    this.identityProvider = selectedProvider;
  }

  verifyToken(token: string): Promise<AuthenticatedIdentity> {
    return this.identityProvider.verifyAccessToken(token);
  }
}
