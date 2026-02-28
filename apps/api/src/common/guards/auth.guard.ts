import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthService } from '../auth/auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reflector = this.reflector ?? new Reflector();
    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();

    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Bearer token.');
    }

    const token = authorization.slice('Bearer '.length).trim();
    request.user = await this.authService.verifyToken(token);
    return true;
  }
}
