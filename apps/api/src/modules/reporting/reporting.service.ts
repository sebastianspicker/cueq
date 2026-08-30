/** Injectable provider for reporting views and custom report previews. */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { ReportingAnalyticsHelper } from './reporting-analytics.helper.js';
import { ReportingComplianceHelper } from './reporting-compliance.helper.js';
import { REPORT_ALLOWED_ROLES } from '../people/public.js';
import { customReportOptions, customReportPreview } from './custom-report.helper.js';

@Injectable()
export class ReportingService {
  constructor(
    @Inject(ReportingComplianceHelper)
    private readonly complianceHelper: ReportingComplianceHelper,
    @Inject(ReportingAnalyticsHelper) private readonly analyticsHelper: ReportingAnalyticsHelper,
  ) {}

  async reportTeamAbsence(user: AuthenticatedIdentity, query: unknown) {
    return this.analyticsHelper.reportTeamAbsence(user, query);
  }

  async reportOeOvertime(user: AuthenticatedIdentity, query: unknown) {
    return this.analyticsHelper.reportOeOvertime(user, query);
  }

  async reportClosingCompletion(user: AuthenticatedIdentity, query: unknown) {
    return this.analyticsHelper.reportClosingCompletion(user, query);
  }

  async reportAuditSummary(user: AuthenticatedIdentity, query: unknown) {
    return this.complianceHelper.reportAuditSummary(user, query);
  }

  async reportComplianceSummary(user: AuthenticatedIdentity, query: unknown) {
    return this.complianceHelper.reportComplianceSummary(user, query);
  }

  reportCustomOptions(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit access to reports.');
    }

    return customReportOptions();
  }

  async reportCustomPreview(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    return customReportPreview(this.analyticsHelper, user, query);
  }

  private assertCanReadReports(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit report access.');
    }
  }
}
