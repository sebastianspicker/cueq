import { SetMetadata } from '@nestjs/common';
import type { Role } from '@cueq/database';

export const ROLES_KEY = 'allowedRoles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
