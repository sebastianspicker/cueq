import { ReconcilePersonnelCsvSchema } from '@cueq/contracts';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { personnelCsvPayload } from './personnel-csv.js';
/** Generic source reconciliation is opt-in and requires a global reconciliation grant. */
import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { PersonHelper } from './person.helper.js';
import { PersonnelQueryService } from './personnel-query.service.js';
import { PersonnelReconciliationService } from './personnel-reconciliation.service.js';

@ApiTags('hr-reconciliation')
@ApiBearerAuth()
@Controller('v1/hr/sources')
export class PersonnelReconciliationController {
  constructor(
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(PersonnelQueryService) private readonly queries: PersonnelQueryService,
    @Inject(PersonnelReconciliationService)
    private readonly reconciliation: PersonnelReconciliationService,
  ) {}

  @Get()
  @Authenticated()
  async list(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    const actor = await this.people.personForUser(user);
    await this.reconciliation.assertGlobal(actor.id);
    return this.queries.sources(query);
  }

  @Post()
  @Authenticated()
  async create(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.reconciliation.createSource((await this.people.personForUser(user)).id, body);
  }

  @Post(':id/reconcile')
  @Authenticated()
  async reconcile(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.reconciliation.reconcile((await this.people.personForUser(user)).id, id, body);
  }

  @Post(':id/reconcile-csv')
  @Authenticated()
  async reconcileCsv(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = parseRequest(ReconcilePersonnelCsvSchema, body);
    return this.reconciliation.reconcile(
      (await this.people.personForUser(user)).id,
      id,
      personnelCsvPayload(input.csv),
    );
  }

  @Get(':id/outbound-changes')
  @Authenticated()
  async outbound(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Query() query: unknown,
  ) {
    const actor = await this.people.personForUser(user);
    await this.reconciliation.assertGlobal(actor.id);
    return this.queries.outbound(id, query);
  }
}
