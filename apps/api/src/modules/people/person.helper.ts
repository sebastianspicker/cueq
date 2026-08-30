/** Resolves authenticated identities to verified personnel records. */
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { resolveAuthenticatedPerson } from '../../platform/auth/resolve-authenticated-person.js';

/**
 * Resolves the Person entity for an authenticated user.
 *
 * Lookup order:
 *  1. Match the identity-provider subject identifier to id or externalId
 *  2. Cross-check the matched record's email against the authenticated claim
 *
 * Email alone never establishes an identity binding.
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
