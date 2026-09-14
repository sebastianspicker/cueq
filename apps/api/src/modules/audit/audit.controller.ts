import { nativeAuditVisibilityWhere } from '../../application/audit/native-audit-visibility.js';
import { resolveAuthenticatedPerson } from '../../platform/auth/resolve-authenticated-person.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
/** Exposes authorized, filtered reads of immutable audit entries. */
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import {
  AuditEntriesQuerySchema,
  type AuditEntriesQuery,
  type AuditEntriesResult,
} from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { Roles } from '../../platform/auth/decorators/roles.decorator.js';
import { ZodValidationPipe } from '../../platform/http/validation/zod-validation.pipe.js';
import { PrismaService } from '../../persistence/prisma.service.js';

/** Read-only audit-trail boundary; access filtering protects employment-data visibility. */
@ApiTags('audit')
@ApiBearerAuth()
@Controller('v1/audit-entries')
export class AuditController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private buildDateWindowFilter({ from, to }: AuditEntriesQuery) {
    return from || to
      ? {
          timestamp: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {};
  }

  private buildExactFilters({ action, entityType, actorId, entityId }: AuditEntriesQuery) {
    return {
      ...(action ? { action } : {}),
      ...(entityType ? { entityType } : {}),
      ...(actorId ? { actorId } : {}),
      ...(entityId ? { entityId } : {}),
    };
  }

  @Get()
  @Roles(Role.HR, Role.ADMIN, Role.DATA_PROTECTION)
  @ApiOperation({
    summary: 'Browse audit entries with optional filters',
    description:
      'Returns a paginated, filterable list of audit entries. ' +
      'Access is restricted to HR, ADMIN, and DATA_PROTECTION roles.',
  })
  @ApiOkResponse({ description: 'Paginated audit entries matching the given filters' })
  @ApiQuery({
    name: 'from',
    required: false,
    type: String,
    description: 'ISO 8601 start timestamp',
  })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO 8601 end timestamp' })
  @ApiQuery({
    name: 'action',
    required: false,
    type: String,
    description: 'Exact action string, e.g. BOOKING_CREATED',
  })
  @ApiQuery({
    name: 'entityType',
    required: false,
    type: String,
    description: 'Entity type, e.g. Booking',
  })
  @ApiQuery({ name: 'actorId', required: false, type: String, description: 'Actor person ID' })
  @ApiQuery({ name: 'entityId', required: false, type: String, description: 'Entity ID' })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Continuation cursor from the previous response',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size 1–100 (default: 50)',
  })
  async listAuditEntries(
    @CurrentUser() user: AuthenticatedIdentity,
    @Query(new ZodValidationPipe(AuditEntriesQuerySchema)) query: unknown,
  ): Promise<AuditEntriesResult> {
    const parsed = AuditEntriesQuerySchema.parse(query);
    const where = {
      ...this.buildDateWindowFilter(parsed),
      ...this.buildExactFilters(parsed),
    };

    const actor = await resolveAuthenticatedPerson(this.prisma, user);
    const visibility = await nativeAuditVisibilityWhere(this.prisma, actor.id);
    const rows = await this.prisma.auditEntry.findMany({
      where: { AND: [where, visibility, cursorWhere('timestamp', parsed.cursor, 'desc')] },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: parsed.limit + 1,
      select: {
        id: true,
        timestamp: true,
        actorId: true,
        action: true,
        entityType: true,
        entityId: true,
        reason: true,
      },
    });
    return cursorPage(
      rows,
      parsed.limit,
      'timestamp',
      (row) => row.timestamp,
      (entry) => ({ ...entry, timestamp: entry.timestamp.toISOString() }),
    );
  }
}
