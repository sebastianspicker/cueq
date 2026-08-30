/** Provider-neutral trust boundary for adapters that verify external access tokens. */
import type { AuthenticatedIdentity } from './auth.types.js';

/** Requires adapters to return only identities backed by successful credential verification. */
export interface IdentityProviderPort {
  verifyAccessToken(token: string): Promise<AuthenticatedIdentity>;
}
