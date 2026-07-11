import { SetMetadata } from '@nestjs/common';
import type { Role } from '@cueq/database';

export const ALLOWED_ROLES_METADATA = 'allowedRoles';
export const Roles = (...roles: Role[]) => SetMetadata(ALLOWED_ROLES_METADATA, roles);
