import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { resolveAuthenticatedPerson } from '../../common/auth/resolve-authenticated-person';

/**
 * Resolves the Person entity for an authenticated user.
 *
 * Lookup order:
 *  1. Match by subject (id or externalId)
 *  2. Fallback: match by email
 *
 * An email cross-check prevents impersonation when both paths yield
 * different person records.
 */
@Injectable()
export class PersonHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async personForUser<I extends Prisma.PersonInclude | undefined = undefined>(
    user: AuthenticatedIdentity,
    options?: { include?: I },
  ) {
    return resolveAuthenticatedPerson(this.prisma, user, options);
  }
}
