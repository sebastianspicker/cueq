/** Authorization policy guard that fails closed when a non-public route declares no access policy. */
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@cueq/database';
import { AUTHENTICATED_ROUTE_METADATA } from '../decorators/authenticated.decorator.js';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public.decorator.js';
import { ALLOWED_ROLES_METADATA } from '../decorators/roles.decorator.js';
import type { AuthenticatedIdentity } from '../auth.types.js';

/** Enforces route role metadata after authentication has attached the trusted identity. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const reflector = this.reflector ?? new Reflector();
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, targets);
    if (isPublic === true) {
      return true;
    }

    const requiredRoles = reflector.getAllAndOverride<Role[]>(ALLOWED_ROLES_METADATA, [...targets]);

    if (requiredRoles && requiredRoles.length > 0) {
      const request = context.switchToHttp().getRequest<{ user?: AuthenticatedIdentity }>();
      const role = request.user?.role;

      if (!role || !requiredRoles.includes(role)) {
        throw new ForbiddenException('Role does not permit this action.');
      }

      return true;
    }

    const isAuthenticated = reflector.get<boolean>(
      AUTHENTICATED_ROUTE_METADATA,
      context.getHandler(),
    );
    if (isAuthenticated === true) {
      return true;
    }

    throw new ForbiddenException('Route authorization policy is not configured.');
  }
}
