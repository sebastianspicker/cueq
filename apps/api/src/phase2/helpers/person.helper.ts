import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';

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
    const include = options?.include;

    const personBySubject = await this.prisma.person.findFirst({
      where: {
        OR: [{ id: user.subject }, { externalId: user.subject }],
      },
      ...(include ? { include } : {}),
    });

    if (personBySubject) {
      if (personBySubject.email.toLowerCase() !== user.email.toLowerCase()) {
        const personByEmail = await this.prisma.person.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (personByEmail && personByEmail.id !== personBySubject.id) {
          throw new ForbiddenException('Authenticated claims do not match person identity.');
        }
      }

      return personBySubject;
    }

    const person = await this.prisma.person.findUnique({
      where: { email: user.email },
      ...(include ? { include } : {}),
    });

    if (!person) {
      throw new NotFoundException('Authenticated person was not found.');
    }

    return person;
  }
}
