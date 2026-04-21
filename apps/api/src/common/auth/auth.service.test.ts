import { afterEach, describe, expect, it } from 'vitest';
import { AuthService } from './auth.service';
import { OidcIdentityProviderAdapter } from './oidc-identity-provider.adapter';
import { SamlIdentityProviderAdapter } from './saml-identity-provider.adapter';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  AUTH_PROVIDER: process.env.AUTH_PROVIDER,
  AUTH_MODE: process.env.AUTH_MODE,
  AUTH_ALLOW_INSECURE_MOCK: process.env.AUTH_ALLOW_INSECURE_MOCK,
  OIDC_ISSUER_URL: process.env.OIDC_ISSUER_URL,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('AuthService provider selection', () => {
  afterEach(() => {
    restoreEnv();
  });

  it('fails closed in production when mock auth would be selected implicitly', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_PROVIDER;
    delete process.env.AUTH_MODE;
    delete process.env.OIDC_ISSUER_URL;
    delete process.env.AUTH_ALLOW_INSECURE_MOCK;

    expect(
      () => new AuthService(new OidcIdentityProviderAdapter(), new SamlIdentityProviderAdapter()),
    ).toThrow(/mock auth provider is disabled in production/iu);
  });

  it('allows explicit insecure mock override in production only when flag is enabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_PROVIDER = 'mock';
    process.env.AUTH_ALLOW_INSECURE_MOCK = 'true';

    expect(
      () => new AuthService(new OidcIdentityProviderAdapter(), new SamlIdentityProviderAdapter()),
    ).not.toThrow();
  });

  it('fails closed when AUTH_PROVIDER has an unsupported value', () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_PROVIDER = 'odci';

    expect(
      () => new AuthService(new OidcIdentityProviderAdapter(), new SamlIdentityProviderAdapter()),
    ).toThrow(/Unsupported AUTH_PROVIDER value/iu);
  });

  it('fails closed when legacy AUTH_MODE has an unsupported value', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.AUTH_PROVIDER;
    process.env.AUTH_MODE = 'saml';

    expect(
      () => new AuthService(new OidcIdentityProviderAdapter(), new SamlIdentityProviderAdapter()),
    ).toThrow(/Unsupported AUTH_MODE value/iu);
  });
});
