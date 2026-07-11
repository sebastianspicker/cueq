import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import type { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from './auth.types';

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

  const personByEmail = await prisma.person.findUnique({
    where: { email: user.email },
    ...(include ? { include } : {}),
  });

  if (!personByEmail) {
    throw new NotFoundException('Authenticated person was not found.');
  }

  return personByEmail;
}

function assertMatchingEmail(persistedEmail: string, claimedEmail: string): void {
  if (persistedEmail.toLowerCase() !== claimedEmail.toLowerCase()) {
    throw new ForbiddenException('Authenticated claims do not match person identity.');
  }
}
