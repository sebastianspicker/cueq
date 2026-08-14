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

type AuthProviderKind = 'mock' | 'oidc' | 'saml';

const AUTH_PROVIDER_KINDS: Readonly<Record<string, AuthProviderKind | undefined>> = {
  mock: 'mock',
  oidc: 'oidc',
  saml: 'saml',
};
const LEGACY_AUTH_MODES: Readonly<Record<string, AuthProviderKind | undefined>> = {
  mock: 'mock',
  oidc: 'oidc',
};

function selectedAuthProviderKind(environment: NodeJS.ProcessEnv): AuthProviderKind {
  const authProvider = (environment.AUTH_PROVIDER ?? '').trim().toLowerCase();
  if (authProvider) {
    const providerKind = AUTH_PROVIDER_KINDS[authProvider];
    if (providerKind) return providerKind;
    throw new Error(
      `Unsupported AUTH_PROVIDER value: ${authProvider}. Expected one of: mock, oidc, saml.`,
    );
  }

  const authMode = (environment.AUTH_MODE ?? '').trim().toLowerCase();
  if (authMode) {
    const providerKind = LEGACY_AUTH_MODES[authMode];
    if (providerKind) return providerKind;
    throw new Error(`Unsupported AUTH_MODE value: ${authMode}. Expected one of: mock, oidc.`);
  }
  return environment.OIDC_ISSUER_URL ? 'oidc' : 'mock';
}

function identityProviderForKind(
  providerKind: AuthProviderKind,
  oidcProvider: OidcIdentityProviderAdapter,
  samlProvider: SamlIdentityProviderAdapter,
): IdentityProviderPort {
  if (providerKind === 'oidc') return oidcProvider;
  if (providerKind === 'saml') return samlProvider;
  return new MockIdentityProviderAdapter();
}

/** Central credential-verification facade used by the HTTP authentication guard. */
@Injectable()
export class AuthService {
  private readonly identityProvider: IdentityProviderPort;

  constructor(
    @Inject(OidcIdentityProviderAdapter) oidcProvider: OidcIdentityProviderAdapter,
    @Inject(SamlIdentityProviderAdapter) samlProvider: SamlIdentityProviderAdapter,
  ) {
    const providerKind = selectedAuthProviderKind(process.env);
    if (providerKind === 'mock' && isProductionRuntime()) {
      throw new Error(
        'Insecure auth configuration: mock auth provider is disabled in production. ' +
          'Set AUTH_PROVIDER to oidc or saml.',
      );
    }

    this.identityProvider = identityProviderForKind(providerKind, oidcProvider, samlProvider);
  }

  verifyToken(token: string): Promise<AuthenticatedIdentity> {
    return this.identityProvider.verifyAccessToken(token);
  }
}
