/** Trusted identity shape attached by authentication guards and consumed by authorization boundaries. */
import type { Role } from '@cueq/database';

/** Claims verified by an identity provider, optionally enriched with a local person record. */
export interface AuthenticatedIdentity {
  subject: string;
  email: string;
  role: Role;
  personId?: string;
  organizationUnitId?: string;
  claims: Record<string, unknown>;
}
