/** Resolves verified external identities to local persons while preventing conflicting email claims. */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from './auth.types.js';

/** Finds the local person for a verified subject and rejects a mismatched persisted email address. */
export async function resolveAuthenticatedPerson<
  I extends Prisma.PersonInclude | undefined = undefined,
>(prisma: PrismaService, user: AuthenticatedIdentity, options?: { include?: I }) {
  const include = options?.include;

  if (user.personId) {
    const personById = await prisma.person.findUnique({
      where: { id: user.personId },
      ...(include ? { include } : {}),
    });

    if (!personById) {
      throw new NotFoundException('Authenticated person was not found.');
    }

    return personById;
  }

  const personBySubjectId = await prisma.person.findUnique({
    where: { id: user.subject },
    ...(include ? { include } : {}),
  });

  const personBySubject =
    personBySubjectId ??
    (await prisma.person.findUnique({
      where: { externalId: user.subject },
      ...(include ? { include } : {}),
    }));

  if (personBySubject) {
    assertMatchingEmail(personBySubject.email, user.email);
    return personBySubject;
  }

  throw new NotFoundException('Authenticated person was not found.');
}

function assertMatchingEmail(persistedEmail: string, claimedEmail: string): void {
  if (persistedEmail.toLowerCase() !== claimedEmail.toLowerCase()) {
    throw new ForbiddenException('Authenticated claims do not match person identity.');
  }
}
