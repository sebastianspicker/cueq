/** Capability-scoped project administration, effort allocation, and reporting. */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public.js';
import { PeopleModule } from '../people/public.js';
import { ProjectManagementService } from './project-management.service.js';
import { ProjectQueryService } from './project-query.service.js';
import { ProjectReportService } from './project-report.service.js';
import { ProjectTimeService } from './project-time.service.js';
import { ProjectsController } from './projects.controller.js';

@Module({
  imports: [AuditModule, PeopleModule],
  controllers: [ProjectsController],
  providers: [
    ProjectManagementService,
    ProjectQueryService,
    ProjectTimeService,
    ProjectReportService,
  ],
  exports: [ProjectManagementService, ProjectTimeService],
})
export class ProjectsModule {}
