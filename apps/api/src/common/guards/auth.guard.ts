import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthService } from '../auth/auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { PrismaService } from '../../persistence/prisma.service';
import { resolveAuthenticatedPerson } from '../auth/resolve-authenticated-person';

const MAX_BEARER_TOKEN_LENGTH = 4096;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/u;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
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
      headers: Record<string, string | string[] | undefined>;
      user?: unknown;
    }>();

    const authorizationHeader = request.headers.authorization;
    if (Array.isArray(authorizationHeader) && authorizationHeader.length !== 1) {
      throw new UnauthorizedException('Multiple Authorization headers are not allowed.');
    }
    const authorization = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]?.trim()
      : authorizationHeader?.trim();
    const bearerMatch = authorization ? /^Bearer\s+(.+)$/iu.exec(authorization) : null;
    if (!bearerMatch) {
      throw new UnauthorizedException('Missing Bearer token.');
    }

    const token = bearerMatch[1]?.trim();
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token.');
    }
    if (token.length > MAX_BEARER_TOKEN_LENGTH) {
      throw new UnauthorizedException('Bearer token is too large.');
    }
    if (CONTROL_CHAR_PATTERN.test(token)) {
      throw new UnauthorizedException('Bearer token is malformed.');
    }

    const verifiedIdentity = await this.authService.verifyToken(token);

    try {
      const person = await resolveAuthenticatedPerson(this.prisma, verifiedIdentity);
      request.user = {
        ...verifiedIdentity,
        personId: person.id,
        role: person.role,
        organizationUnitId: person.organizationUnitId,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Authenticated person could not be resolved.',
      );
    }

    return true;
  }
}
