/** HTTP surface for capability-scoped projects and personal project-time allocation. */
import { Body, Controller, Get, Inject, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { Authenticated } from '../../platform/auth/decorators/authenticated.decorator.js';
import { CurrentUser } from '../../platform/auth/decorators/current-user.decorator.js';
import { CursorPagination } from '../../platform/http/cursor-pagination.decorator.js';
import { ParseCuidPipe } from '../../platform/http/validation/parse-cuid.pipe.js';
import { PersonHelper } from '../people/public.js';
import { ProjectManagementService } from './project-management.service.js';
import { ProjectQueryService } from './project-query.service.js';
import { ProjectReportService } from './project-report.service.js';
import { ProjectTimeService } from './project-time.service.js';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('v1/projects')
export class ProjectsController {
  constructor(
    @Inject(PersonHelper) private readonly people: PersonHelper,
    @Inject(ProjectManagementService) private readonly management: ProjectManagementService,
    @Inject(ProjectQueryService) private readonly queries: ProjectQueryService,
    @Inject(ProjectTimeService) private readonly time: ProjectTimeService,
    @Inject(ProjectReportService) private readonly reports: ProjectReportService,
  ) {}

  private async actorId(user: AuthenticatedIdentity) {
    return (await this.people.personForUser(user)).id;
  }

  @Get()
  @Authenticated()
  @CursorPagination()
  @ApiOperation({ summary: 'List explicitly authorized projects' })
  async list(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.queries.list(await this.actorId(user), query);
  }

  @Post()
  @Authenticated()
  @ApiOperation({ summary: 'Create a project' })
  async create(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.management.create(await this.actorId(user), body);
  }

  @Get('time/allocations')
  @Authenticated()
  @CursorPagination()
  @ApiOperation({ summary: 'List personal project-time allocations' })
  async allocations(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.time.allocations(await this.actorId(user), query);
  }

  @Post('time/allocations')
  @Authenticated()
  @ApiOperation({ summary: 'Create or replace a personal booking/project allocation' })
  async allocate(@CurrentUser() user: AuthenticatedIdentity, @Body() body: unknown) {
    return this.time.allocate(await this.actorId(user), body);
  }

  @Post('time/allocations/:allocationId/release')
  @Authenticated()
  @ApiOperation({
    summary: 'Release allocated minutes while preserving the record and audit history',
  })
  async release(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('allocationId', ParseCuidPipe) allocationId: string,
  ) {
    return this.time.release(await this.actorId(user), allocationId);
  }

  @Get('time/unallocated')
  @Authenticated()
  @CursorPagination()
  @ApiOperation({ summary: 'List personal ended bookings with unallocated minutes' })
  async unallocated(@CurrentUser() user: AuthenticatedIdentity, @Query() query: unknown) {
    return this.time.unallocated(await this.actorId(user), query);
  }

  @Get(':id/report')
  @Authenticated()
  @ApiOperation({ summary: 'Get a privacy-thresholded project budget and effort summary' })
  async report(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) projectId: string,
    @Query() query: unknown,
  ) {
    return this.reports.summary(await this.actorId(user), projectId, query);
  }

  @Get(':id/report.csv')
  @Authenticated()
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download a privacy-thresholded project effort CSV' })
  async reportCsv(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) projectId: string,
    @Query() query: unknown,
    @Res() response: Response,
  ) {
    const result = await this.reports.csv(await this.actorId(user), projectId, query);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.status(200).send(result.csv);
  }

  @Get(':id')
  @Authenticated()
  @ApiOperation({ summary: 'Get an explicitly authorized project' })
  async detail(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) projectId: string,
  ) {
    return this.queries.detail(await this.actorId(user), projectId);
  }

  @Post(':id/archive')
  @Authenticated()
  @ApiOperation({ summary: 'Archive a project while preserving its history' })
  async archive(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) projectId: string,
  ) {
    return this.management.archive(await this.actorId(user), projectId);
  }

  @Get(':id/memberships')
  @Authenticated()
  @CursorPagination()
  @ApiOperation({ summary: 'List project appointment memberships' })
  async members(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) projectId: string,
    @Query() query: unknown,
  ) {
    return this.management.members(await this.actorId(user), projectId, query);
  }

  @Post(':id/memberships')
  @Authenticated()
  @ApiOperation({ summary: 'Add an effective appointment membership to a project' })
  async addMember(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) projectId: string,
    @Body() body: unknown,
  ) {
    return this.management.addMember(await this.actorId(user), projectId, body);
  }

  @Post(':id/memberships/:membershipId/end')
  @Authenticated()
  @ApiOperation({ summary: 'End an active project appointment membership' })
  async endMembership(
    @CurrentUser() user: AuthenticatedIdentity,
    @Param('id', ParseCuidPipe) projectId: string,
    @Param('membershipId', ParseCuidPipe) membershipId: string,
  ) {
    return this.management.endMembership(await this.actorId(user), projectId, membershipId);
  }
}
