/** Compatibility implementation for the injectable reporting provider. */
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { ReportingComplianceHelper } from '../helpers/reporting-compliance.helper.js';
import type { ReportingAnalyticsHelper } from '../helpers/reporting-analytics.helper.js';
import { REPORT_ALLOWED_ROLES } from '../helpers/role-constants.js';
import { customReportOptions, customReportPreview } from './custom-report.helper.js';

export type ReportingDependencies = {
  complianceHelper: ReportingComplianceHelper;
  analyticsHelper: ReportingAnalyticsHelper;
};

export class ReportingFacade {
  constructor(private readonly dependencies: ReportingDependencies) {}

  async reportTeamAbsence(user: AuthenticatedIdentity, query: unknown) {
    return this.dependencies.analyticsHelper.reportTeamAbsence(user, query);
  }

  async reportOeOvertime(user: AuthenticatedIdentity, query: unknown) {
    return this.dependencies.analyticsHelper.reportOeOvertime(user, query);
  }

  async reportClosingCompletion(user: AuthenticatedIdentity, query: unknown) {
    return this.dependencies.analyticsHelper.reportClosingCompletion(user, query);
  }

  async reportAuditSummary(user: AuthenticatedIdentity, query: unknown) {
    return this.dependencies.complianceHelper.reportAuditSummary(user, query);
  }

  async reportComplianceSummary(user: AuthenticatedIdentity, query: unknown) {
    return this.dependencies.complianceHelper.reportComplianceSummary(user, query);
  }

  reportCustomOptions(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit access to reports.');
    }

    return customReportOptions();
  }

  async reportCustomPreview(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    return customReportPreview(this.dependencies.analyticsHelper, user, query);
  }

  private assertCanReadReports(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit report access.');
    }
  }
}
