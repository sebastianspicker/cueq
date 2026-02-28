import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@cueq/database';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedIdentity } from '../auth/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const reflector = this.reflector ?? new Reflector();
    const requiredRoles = reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedIdentity }>();
    const role = request.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Role does not permit this action.');
    }

    return true;
  }
}
