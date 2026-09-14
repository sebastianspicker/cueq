import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
/** Minimal self-only appointment context for existing operational features. */
import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CursorQuerySchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { PersonHelper } from './person.helper.js';

@ApiTags('session')
@ApiBearerAuth()
@Controller('v1/session/assignments')
export class AssignmentContextController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly people: PersonHelper,
  ) {}

  @Get()
  @Authenticated()
  async list(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    const actor = await this.people.personForUser(user);
    const parsed = parseRequest(CursorQuerySchema, query);
    const now = new Date();
    const today = new Date(now.toISOString().slice(0, 10));
    const rows = await this.prisma.employmentAssignment.findMany({
      where: { personId: actor.id, AND: [cursorWhere('createdAt', parsed.cursor)] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: parsed.limit + 1,
      select: {
        id: true,
        label: true,
        legacy: true,
        employmentStartDate: true,
        employmentEndDate: true,
        createdAt: true,
      },
    });
    return cursorPage(
      rows,
      parsed.limit,
      'createdAt',
      (row) => row.createdAt,
      (row) => ({
        id: row.id,
        label: row.label,
        legacy: row.legacy,
        active:
          (!row.employmentStartDate || row.employmentStartDate <= now) &&
          (!row.employmentEndDate || row.employmentEndDate >= today),
      }),
    );
  }
}
