/** Creates idempotent, traceable payroll export artifacts for approved periods. */
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ClosingExportRequestSchema } from '@cueq/contracts';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { PrismaService } from '../../persistence/prisma.service.js';
import { AuditHelper, EventOutboxHelper } from '../audit/public.js';
import { ClosingExportDownloadHelper } from './closing-export-download.helper.js';
import { runClosingExportLifecycle } from './closing-export-lifecycle.js';
import { HR_LIKE_ROLES, PersonHelper, AssignmentHelper } from '../people/public.js';
import { TIME_ACCOUNTS_PORT, type TimeAccountsPort } from '../attendance/public.js';

/** Keeps the public export API stable while delegating lifecycle work to a transaction helper. */
@Injectable()
export class ClosingExportHelper {
  private readonly downloadHelper: ClosingExportDownloadHelper;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AssignmentHelper) private readonly assignmentHelper: AssignmentHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
    @Inject(TIME_ACCOUNTS_PORT) private readonly timeAccounts: TimeAccountsPort,
  ) {
    this.downloadHelper = new ClosingExportDownloadHelper({ prisma, personHelper, auditHelper });
  }

  async exportClosing(user: AuthenticatedIdentity, closingPeriodId: string, payload?: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can export closing periods.');
    }
    const format = ClosingExportRequestSchema.parse(payload ?? {}).format ?? 'CSV_V2';
    const actor = await this.personHelper.personForUser(user);

    return this.prisma.$transaction((tx) =>
      runClosingExportLifecycle(tx, closingPeriodId, format, actor, {
        assignmentHelper: this.assignmentHelper,
        auditHelper: this.auditHelper,
        eventOutboxHelper: this.eventOutboxHelper,
        timeAccounts: this.timeAccounts,
      }),
    );
  }

  async getExportRunCsv(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    return this.downloadHelper.getExportRunCsv(user, closingPeriodId, runId);
  }

  async getExportRunArtifact(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    return this.downloadHelper.getExportRunArtifact(user, closingPeriodId, runId);
  }
}
