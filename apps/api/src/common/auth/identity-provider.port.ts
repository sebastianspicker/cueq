import type { AuthenticatedIdentity } from './auth.types';

export interface IdentityProviderPort {
  verifyAccessToken(token: string): Promise<AuthenticatedIdentity>;
}
