import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { AuditEntriesQuerySchema, type AuditEntriesResult } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../persistence/prisma.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('v1/audit-entries')
export class AuditController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.HR, Role.ADMIN, Role.DATA_PROTECTION)
  @ApiOperation({
    summary: 'Browse audit entries with optional filters',
    description:
      'Returns a paginated, filterable list of audit entries. ' +
      'Access is restricted to HR, ADMIN, and DATA_PROTECTION roles.',
  })
  @ApiOkResponse({ description: 'Paginated audit entries matching the given filters' })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO 8601 start timestamp' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO 8601 end timestamp' })
  @ApiQuery({ name: 'action', required: false, type: String, description: 'Exact action string, e.g. BOOKING_CREATED' })
  @ApiQuery({ name: 'entityType', required: false, type: String, description: 'Entity type, e.g. Booking' })
  @ApiQuery({ name: 'actorId', required: false, type: String, description: 'Actor person ID' })
  @ApiQuery({ name: 'entityId', required: false, type: String, description: 'Entity ID' })
  @ApiQuery({ name: 'skip', required: false, type: Number, description: 'Pagination offset (default: 0)' })
  @ApiQuery({ name: 'take', required: false, type: Number, description: 'Page size 1–200 (default: 50)' })
  async listAuditEntries(
    @CurrentUser() _user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(AuditEntriesQuerySchema)) query: unknown,
  ): Promise<AuditEntriesResult> {
    const parsed = query as import('@cueq/shared').AuditEntriesQuery;

    const where = {
      ...(parsed.from || parsed.to
        ? {
            timestamp: {
              ...(parsed.from ? { gte: new Date(parsed.from) } : {}),
              ...(parsed.to ? { lte: new Date(parsed.to) } : {}),
            },
          }
        : {}),
      ...(parsed.action ? { action: parsed.action } : {}),
      ...(parsed.entityType ? { entityType: parsed.entityType } : {}),
      ...(parsed.actorId ? { actorId: parsed.actorId } : {}),
      ...(parsed.entityId ? { entityId: parsed.entityId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditEntry.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: parsed.skip,
        take: parsed.take,
        select: {
          id: true,
          timestamp: true,
          actorId: true,
          action: true,
          entityType: true,
          entityId: true,
          reason: true,
        },
      }),
      this.prisma.auditEntry.count({ where }),
    ]);

    return {
      items: items.map((entry) => ({
        ...entry,
        timestamp: entry.timestamp.toISOString(),
      })),
      total,
      skip: parsed.skip,
      take: parsed.take,
    };
  }
}
