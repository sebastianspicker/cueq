/** Route metadata contract for explicit role-based authorization. */
import { SetMetadata } from '@nestjs/common';
import type { Role } from '@cueq/database';

/** Metadata key containing the finite role allow-list enforced by `RolesGuard`. */
export const ALLOWED_ROLES_METADATA = 'allowedRoles';
/** Declares the only roles a guarded route may admit. */
export const Roles = (...roles: Role[]) => SetMetadata(ALLOWED_ROLES_METADATA, roles);
