/** Explicit capability checks for new HR features; membership alone grants nothing. */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import type { HrCapability } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';

export type CapabilityResource = {
  personId?: string;
  organizationUnitId?: string;
  projectId?: string;
};
type GrantClient = Pick<Prisma.TransactionClient, 'capabilityGrant'>;

@Injectable()
export class CapabilityHelper {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Resource identifiers must come from authorized database records, never unverified request metadata. */
  async allows(
    actorId: string,
    capability: HrCapability,
    resource: CapabilityResource,
    tx: GrantClient = this.prisma,
  ): Promise<boolean> {
    const now = new Date();
    const scopes: Prisma.CapabilityGrantWhereInput[] = [{ scope: 'GLOBAL', targetId: null }];
    if (resource.personId === actorId) scopes.push({ scope: 'SELF', targetId: null });
    if (resource.personId) scopes.push({ scope: 'PERSON', targetId: resource.personId });
    if (resource.organizationUnitId)
      scopes.push({ scope: 'ORGANIZATION', targetId: resource.organizationUnitId });
    if (resource.projectId) scopes.push({ scope: 'PROJECT', targetId: resource.projectId });
    return Boolean(
      await tx.capabilityGrant.findFirst({
        where: {
          granteeId: actorId,
          capability,
          revokedAt: null,
          activeFrom: { lte: now },
          AND: [{ OR: [{ activeTo: null }, { activeTo: { gt: now } }] }, { OR: scopes }],
        },
        select: { id: true },
      }),
    );
  }

  async assert(
    actorId: string,
    capability: HrCapability,
    resource: CapabilityResource,
    tx: GrantClient = this.prisma,
  ): Promise<void> {
    if (!(await this.allows(actorId, capability, resource, tx))) {
      throw new ForbiddenException({
        code: 'CAPABILITY_REQUIRED',
        message: 'An explicit scope grant is required for this action.',
      });
    }
  }
}
