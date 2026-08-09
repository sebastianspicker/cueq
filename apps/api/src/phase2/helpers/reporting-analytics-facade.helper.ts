/** Builds role-scoped analytics reports through a stable injectable facade. */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import { AuditHelper } from './audit.helper.js';
import { PersonHelper } from './person.helper.js';
import {
  reportClosingCompletion,
  reportOeOvertime,
  reportTeamAbsence,
} from './reporting-analytics-reports.helper.js';
import { ReportingComplianceHelper } from './reporting-compliance.helper.js';
import { REPORT_ALLOWED_ROLES } from './role-constants.js';

/** Assembles operational reports under organization scope and applies group suppression. */
@Injectable()
export class ReportingAnalyticsHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(ReportingComplianceHelper) private readonly complianceHelper: ReportingComplianceHelper,
  ) {}

  private assertCanReadReports(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit report access.');
    }
  }

  async reportTeamAbsence(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    return reportTeamAbsence(
      {
        prisma: this.prisma,
        auditHelper: this.auditHelper,
        personHelper: this.personHelper,
        complianceHelper: this.complianceHelper,
      },
      user,
      query,
    );
  }

  async reportOeOvertime(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    return reportOeOvertime(
      {
        prisma: this.prisma,
        auditHelper: this.auditHelper,
        personHelper: this.personHelper,
        complianceHelper: this.complianceHelper,
      },
      user,
      query,
    );
  }

  async reportClosingCompletion(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    return reportClosingCompletion(
      {
        prisma: this.prisma,
        auditHelper: this.auditHelper,
        personHelper: this.personHelper,
        complianceHelper: this.complianceHelper,
      },
      user,
      query,
    );
  }
}
