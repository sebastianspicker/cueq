/** Capability-scoped lifecycle administration, instances, tasks, and automation. */
import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { CursorPagination } from '../../platform/http/cursor-pagination.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { PersonHelper } from '../people/public.js';
import { LifecycleConfigurationService } from './lifecycle-configuration.service.js';
import { LifecycleInstanceService } from './lifecycle-instance.service.js';
import { LifecycleTaskService } from './lifecycle-task.service.js';

@ApiTags('lifecycle')
@ApiBearerAuth()
@Controller('v1/lifecycle')
export class LifecycleController {
  constructor(
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(LifecycleConfigurationService)
    private readonly configuration: LifecycleConfigurationService,
    @Inject(LifecycleInstanceService) private readonly instances: LifecycleInstanceService,
    @Inject(LifecycleTaskService) private readonly tasks: LifecycleTaskService,
  ) {}

  private async actorId(user: AuthenticatedIdentity) {
    return (await this.people.personForUser(user)).id;
  }

  @Get('templates')
  @Authenticated()
  @CursorPagination()
  async templates(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.configuration.templates(await this.actorId(user), query);
  }

  @Post('templates')
  @Authenticated()
  async createTemplate(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.configuration.createTemplate(await this.actorId(user), body);
  }

  @Patch('templates/:id')
  @Authenticated()
  async editTemplate(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) templateId: string,
    @Body() body: unknown,
  ) {
    return this.configuration.editTemplate(await this.actorId(user), templateId, body);
  }

  @Post('templates/:id/activate')
  @Authenticated()
  async activateTemplate(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) templateId: string,
  ) {
    return this.configuration.activateTemplate(await this.actorId(user), templateId);
  }

  @Get('groups')
  @Authenticated()
  @CursorPagination()
  async groups(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.configuration.groups(await this.actorId(user), query);
  }

  @Post('groups')
  @Authenticated()
  async createGroup(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.configuration.createGroup(await this.actorId(user), body);
  }

  @Get('automation')
  @Authenticated()
  @CursorPagination()
  async automations(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.configuration.automations(await this.actorId(user), query);
  }

  @Post('automation')
  @Authenticated()
  async createAutomation(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.configuration.createAutomation(await this.actorId(user), body);
  }

  @Get('instances')
  @Authenticated()
  @CursorPagination()
  async listInstances(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.instances.list(await this.actorId(user), query);
  }

  @Post('instances')
  @Authenticated()
  async activateInstance(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.instances.activate(await this.actorId(user), body);
  }

  @Get('instances/:id')
  @Authenticated()
  async instance(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) instanceId: string,
  ) {
    return this.instances.detail(await this.actorId(user), instanceId);
  }

  @Get('tasks/inbox')
  @Authenticated()
  @CursorPagination()
  async taskInbox(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.tasks.inbox(await this.actorId(user), query);
  }

  @Post('tasks/:id/complete')
  @Authenticated()
  async completeTask(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) taskId: string,
    @Body() body: unknown,
  ) {
    return this.tasks.complete(await this.actorId(user), taskId, body);
  }

  @Get('tasks/:id/history')
  @Authenticated()
  @CursorPagination()
  async taskHistory(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) taskId: string,
    @Query() query: unknown,
  ) {
    return this.tasks.history(await this.actorId(user), taskId, query);
  }
}
