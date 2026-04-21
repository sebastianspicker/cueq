import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../auth/auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity => {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedIdentity }>();
    if (!request.user) {
      throw new Error('Authenticated user missing from request context.');
    }

    return request.user;
  },
);
