/** Operational reporting and compliance API surface. */
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public.js';
import { PeopleModule } from '../people/public.js';
import { ReportingAnalyticsHelper } from './reporting-analytics.helper.js';
import { ReportingComplianceHelper } from './reporting-compliance.helper.js';
import { ReportingService } from './reporting.service.js';
import { ReportsController } from './reports.controller.js';

@Module({
  imports: [AuditModule, PeopleModule],
  controllers: [ReportsController],
  providers: [ReportingAnalyticsHelper, ReportingComplianceHelper, ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
