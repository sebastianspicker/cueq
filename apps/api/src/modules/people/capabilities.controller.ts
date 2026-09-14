import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
/** Administrator-managed grants for native HR capabilities. */
import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { CreateCapabilityGrantSchema, CursorQuerySchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { Roles } from '../../platform/auth/decorators/roles.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { AuditHelper } from '../audit/public.js';
import { PersonHelper } from './person.helper.js';

@ApiTags('capabilities')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('v1/hr/capability-grants')
export class CapabilitiesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.capabilityGrant.findMany({
      where: cursorWhere('createdAt', parsed.cursor),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: parsed.limit + 1,
    });
    return cursorPage(
      rows,
      parsed.limit,
      'createdAt',
      (row) => row.createdAt,
      (row) => row,
    );
  }

  @Post()
  async create(@CurrentUser() user: AuthenticatedIdentity, @Body() payload: unknown) {
    const actor = await this.people.personForUser(user);
    const parsed = parseRequest(CreateCapabilityGrantSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.person.findUnique({ where: { id: parsed.granteeId }, select: { id: true } })))
        throw new NotFoundException('Grant recipient not found.');
      if (
        parsed.scope === 'PERSON' &&
        parsed.targetId &&
        !(await tx.person.findUnique({ where: { id: parsed.targetId }, select: { id: true } }))
      )
        throw new NotFoundException('Grant target not found.');
      if (
        parsed.scope === 'ORGANIZATION' &&
        parsed.targetId &&
        !(await tx.organizationUnit.findUnique({
          where: { id: parsed.targetId },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Grant target not found.');
      if (
        parsed.scope === 'PROJECT' &&
        parsed.targetId &&
        !(await tx.project.findUnique({ where: { id: parsed.targetId }, select: { id: true } }))
      )
        throw new NotFoundException('Grant target not found.');
      const grant = await tx.capabilityGrant.create({
        data: {
          ...parsed,
          activeFrom: new Date(parsed.activeFrom),
          activeTo: parsed.activeTo ? new Date(parsed.activeTo) : null,
          grantedById: actor.id,
        },
      });
      await this.audit.appendAudit(
        {
          actorId: actor.id,
          action: 'CAPABILITY_GRANTED',
          entityType: 'CapabilityGrant',
          entityId: grant.id,
          after: {
            granteeId: grant.granteeId,
            capability: grant.capability,
            scope: grant.scope,
            targetId: grant.targetId,
          },
          reason: parsed.reason,
        },
        tx,
      );
      return grant;
    });
  }

  @Post(':id/revoke')
  async revoke(@CurrentUser() user: AuthenticatedIdentity, @Param('id', ParseCuidPipe) id: string) {
    const actor = await this.people.personForUser(user);
    return this.prisma.$transaction(async (tx) => {
      const grant = await tx.capabilityGrant.findUnique({ where: { id } });
      if (!grant) throw new NotFoundException('Grant not found.');
      if (grant.revokedAt) return grant;
      const revokedAt = new Date();
      const changed = await tx.capabilityGrant.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt },
      });
      const updated = await tx.capabilityGrant.findUniqueOrThrow({ where: { id } });
      if (changed.count === 0) return updated;
      await this.audit.appendAudit(
        {
          actorId: actor.id,
          action: 'CAPABILITY_REVOKED',
          entityType: 'CapabilityGrant',
          entityId: id,
          after: { revokedAt: updated.revokedAt?.toISOString() ?? null },
        },
        tx,
      );
      return updated;
    });
  }
}
