import type { Role } from '@cueq/database';

export interface AuthenticatedIdentity {
  subject: string;
  email: string;
  role: Role;
  personId?: string;
  organizationUnitId?: string;
  claims: Record<string, unknown>;
}
