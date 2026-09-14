import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
/** Native personnel self-service and authorized directory routes. */
import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreatePersonnelRelationshipSchema } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { PrismaService } from '../../persistence/prisma.service.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { PersonHelper } from './person.helper.js';
import { PersonnelQueryService } from './personnel-query.service.js';
import { ProfileChangesService } from './profile-changes.service.js';
import { assertPersonnelScope } from './personnel-scope.js';

@ApiTags('personnel')
@ApiBearerAuth()
@Controller('v1/personnel')
export class PersonnelController {
  constructor(
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(PersonnelQueryService) private readonly queries: PersonnelQueryService,
    @Inject(ProfileChangesService) private readonly changes: ProfileChangesService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  @Get()
  @Authenticated()
  async directory(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.queries.directory((await this.people.personForUser(user)).id, query);
  }

  @Get('organizations')
  @Authenticated()
  async organizations(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.queries.organizations((await this.people.personForUser(user)).id, query);
  }

  @Get('me')
  @Authenticated()
  async me(@CurrentUser() user: AuthenticatedIdentity) {
    const actor = await this.people.personForUser(user);
    return this.queries.profile(actor.id, actor.id);
  }

  @Get('changes')
  @Authenticated()
  async listChanges(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.queries.changes((await this.people.personForUser(user)).id, query);
  }

  @Post('changes')
  @Authenticated()
  async request(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.changes.request((await this.people.personForUser(user)).id, body);
  }

  @Post('changes/:id/review')
  @Authenticated()
  async review(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.changes.review((await this.people.personForUser(user)).id, id, body);
  }

  @Get(':id')
  @Authenticated()
  async profile(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
  ) {
    return this.queries.profile((await this.people.personForUser(user)).id, id);
  }

  @Get(':id/relationships')
  @Authenticated()
  async relationships(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Query() query: unknown,
  ) {
    return this.queries.relationships((await this.people.personForUser(user)).id, id, query);
  }

  @Post('relationships')
  @Authenticated()
  async createRelationship(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    const actor = await this.people.personForUser(user);
    const input = parseRequest(CreatePersonnelRelationshipSchema, body);
    return this.prisma.$transaction(async (tx) => {
      await lockPersonWrites(tx, [input.subjectPersonId, input.relatedPersonId]);
      await assertPersonnelScope(tx, actor.id, 'personnel.manage', input.subjectPersonId);
      await assertPersonnelScope(tx, actor.id, 'personnel.read', input.relatedPersonId);
      const relationship = await tx.personnelRelationship.create({
        data: {
          ...input,
          effectiveFrom: new Date(input.effectiveFrom),
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
        },
      });
      await this.audit.appendAudit(
        {
          actorId: actor.id,
          action: 'PERSONNEL_RELATIONSHIP_CREATED',
          entityType: 'PersonnelRelationship',
          entityId: relationship.id,
          after: { kind: input.kind },
        },
        tx,
      );
      return relationship;
    });
  }
}
