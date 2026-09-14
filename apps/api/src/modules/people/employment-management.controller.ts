/** Appointment history and institutional configuration administration. */
import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { PersonHelper } from './person.helper.js';
import { EmploymentManagementService } from './employment-management.service.js';
import { EmploymentConfigurationService } from './employment-configuration.service.js';

@ApiTags('employment')
@ApiBearerAuth()
@Controller('v1/employment')
export class EmploymentManagementController {
  constructor(
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(EmploymentManagementService) private readonly employment: EmploymentManagementService,
    @Inject(EmploymentConfigurationService)
    private readonly configuration: EmploymentConfigurationService,
  ) {}

  @Get('assignments')
  @Authenticated()
  async list(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.employment.list((await this.people.personForUser(user)).id, query);
  }

  @Post('assignments')
  @Authenticated()
  async create(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.employment.create((await this.people.personForUser(user)).id, body);
  }

  @Get('assignments/:id/terms')
  @Authenticated()
  async terms(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Query() query: unknown,
  ) {
    return this.employment.terms((await this.people.personForUser(user)).id, id, query);
  }

  @Post('assignments/:id/terms')
  @Authenticated()
  async append(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.employment.appendTerm((await this.people.personForUser(user)).id, id, body);
  }

  @Get('groups')
  @Authenticated()
  async groups(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.configuration.list((await this.people.personForUser(user)).id, 'groups', query);
  }

  @Post('groups')
  @Authenticated()
  async createGroup(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.configuration.createGroup((await this.people.personForUser(user)).id, body);
  }

  @Get('calendars')
  @Authenticated()
  async calendars(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.configuration.list((await this.people.personForUser(user)).id, 'calendars', query);
  }

  @Post('calendars')
  @Authenticated()
  async createCalendar(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.configuration.createCalendar((await this.people.personForUser(user)).id, body);
  }
}
