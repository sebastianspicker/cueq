/** Authentication boundary that validates bearer credentials and resolves them to a local person record. */
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthService } from '../auth.service.js';
import { PUBLIC_ROUTE_METADATA } from '../decorators/public.decorator.js';
import type { PrismaService } from '../../../persistence/prisma.service.js';
import { resolveAuthenticatedPerson } from '../resolve-authenticated-person.js';

const MAX_BEARER_TOKEN_LENGTH = 4096;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/u;

function bearerToken(headers: Record<string, string | string[] | undefined>): string {
  const authorizationHeader = headers.authorization;
  if (Array.isArray(authorizationHeader) && authorizationHeader.length !== 1) {
    throw new UnauthorizedException('Multiple Authorization headers are not allowed.');
  }

  const authorization = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]?.trim()
    : authorizationHeader?.trim();
  const token = authorization ? /^Bearer\s+(.+)$/iu.exec(authorization)?.[1]?.trim() : undefined;
  if (!token) {
    throw new UnauthorizedException('Missing Bearer token.');
  }
  if (token.length > MAX_BEARER_TOKEN_LENGTH) {
    throw new UnauthorizedException('Bearer token is too large.');
  }
  if (CONTROL_CHAR_PATTERN.test(token)) {
    throw new UnauthorizedException('Bearer token is malformed.');
  }

  return token;
}

function resolutionErrorClass(error: unknown): string {
  return error instanceof Error ? error.constructor.name : 'UnknownError';
}

/** Rejects malformed or unresolved identities before handlers can access request.user. */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const reflector = this.reflector ?? new Reflector();
    const isPublic = reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_METADATA, [
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

    const token = bearerToken(request.headers);
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

      this.logger.warn({
        event: 'auth_identity_resolution_failed',
        errorClass: resolutionErrorClass(error),
      });
      throw new UnauthorizedException('Authenticated person could not be resolved.');
    }

    return true;
  }
}
