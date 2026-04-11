import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ClosingLockSource, ClosingStatus, Role } from '@cueq/database';
import { ClosingPeriodMonthQuerySchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from '../helpers/audit.helper';
import { PersonHelper } from '../helpers/person.helper';
import { CLOSING_READ_ROLES } from '../helpers/role-constants';
import { ClosingChecklistHelper } from '../helpers/closing-checklist.helper';
import { ClosingCorrectionHelper } from '../helpers/closing-correction.helper';
import { ClosingExportHelper } from '../helpers/closing-export.helper';
import { ClosingLifecycleHelper } from '../helpers/closing-lifecycle.helper';
import {
  closingAutoCutoffEnabled,
  cutoffAtForPeriod,
  mapClosingPeriodResponse,
  parseMonthToRange,
} from '../helpers/closing-utils';

/* ── Service ─────────────────────────────────────────────── */

@Injectable()
export class ClosingDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(ClosingChecklistHelper) private readonly checklistHelper: ClosingChecklistHelper,
    @Inject(ClosingExportHelper) private readonly exportHelper: ClosingExportHelper,
    @Inject(ClosingCorrectionHelper) private readonly correctionHelper: ClosingCorrectionHelper,
    @Inject(ClosingLifecycleHelper) private readonly lifecycleHelper: ClosingLifecycleHelper,
  ) {}

  /* ── Cutoff ──────────────────────────────────────────────── */

  async runClosingCutoff(now: Date = new Date()) {
    if (!closingAutoCutoffEnabled()) {
      return {
        enabled: false,
        evaluated: 0,
        transitioned: 0,
      };
    }

    const periods = await this.prisma.closingPeriod.findMany({
      where: { status: ClosingStatus.OPEN },
      select: { id: true, periodStart: true, periodEnd: true, organizationUnitId: true },
      orderBy: { periodStart: 'asc' },
    });

    const actorId = await this.auditHelper.resolveSystemActorId();
    let transitioned = 0;

    for (const period of periods) {
      const cutoff = cutoffAtForPeriod(period);
      if (now < cutoff) {
        continue;
      }

      const updated = await this.prisma.closingPeriod.updateMany({
        where: {
          id: period.id,
          status: ClosingStatus.OPEN,
        },
        data: {
          status: ClosingStatus.REVIEW,
          lockedAt: now,
          lockSource: ClosingLockSource.AUTO_CUTOFF,
        },
      });

      if (updated.count === 0) {
        continue;
      }

      transitioned += 1;

      if (actorId) {
        await this.auditHelper.appendAudit({
          actorId,
          action: 'CLOSING_CUTOFF_APPLIED',
          entityType: 'ClosingPeriod',
          entityId: period.id,
          before: { status: 'OPEN' },
          after: {
            status: 'REVIEW',
            lockedAt: now.toISOString(),
            lockSource: 'AUTO_CUTOFF',
            cutoffAt: cutoff.toISOString(),
          },
        });
      }
    }

    return {
      enabled: true,
      evaluated: periods.length,
      transitioned,
    };
  }

  /* ── Period Queries ──────────────────────────────────────── */

  async listClosingPeriods(
    user: AuthenticatedIdentity,
    fromMonth?: string,
    toMonth?: string,
    organizationUnitId?: string,
  ) {
    const actor = await this.personHelper.personForUser(user);
    const parsed = ClosingPeriodMonthQuerySchema.parse({
      from: fromMonth,
      to: toMonth,
      organizationUnitId,
    });
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing periods.');
    }

    if (
      user.role === Role.TEAM_LEAD &&
      parsed.organizationUnitId &&
      parsed.organizationUnitId !== actor.organizationUnitId
    ) {
      throw new ForbiddenException('Team leads can only access closing periods in their own unit.');
    }

    const from = parsed.from
      ? parseMonthToRange(parsed.from).from
      : new Date('2026-01-01T00:00:00.000Z');
    const to = parsed.to ? parseMonthToRange(parsed.to).to : new Date('2030-12-31T23:59:59.000Z');
    const targetOuId =
      user.role === Role.TEAM_LEAD ? actor.organizationUnitId : parsed.organizationUnitId;

    const periods = await this.prisma.closingPeriod.findMany({
      where: {
        organizationUnitId: targetOuId,
        periodStart: { lte: to },
        periodEnd: { gte: from },
      },
      include: {
        exportRuns: {
          orderBy: { exportedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { periodStart: 'desc' },
    });

    return periods.map(mapClosingPeriodResponse);
  }

  async getClosingPeriod(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personHelper.personForUser(user);
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing periods.');
    }

    const period = await this.prisma.closingPeriod.findUnique({
      where: { id: closingPeriodId },
      include: { exportRuns: { orderBy: { exportedAt: 'desc' } } },
    });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    if (user.role === Role.TEAM_LEAD && period.organizationUnitId !== actor.organizationUnitId) {
      throw new ForbiddenException('Team leads can only access closing periods in their own unit.');
    }

    return mapClosingPeriodResponse(period);
  }

  /* ── Delegated to Helpers ────────────────────────────────── */

  async startClosingReview(user: AuthenticatedIdentity, closingPeriodId: string) {
    return this.lifecycleHelper.startClosingReview(user, closingPeriodId);
  }

  async leadApproveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    return this.lifecycleHelper.leadApproveClosing(user, closingPeriodId);
  }

  async reopenClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    return this.lifecycleHelper.reopenClosing(user, closingPeriodId);
  }

  async approveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    return this.lifecycleHelper.approveClosing(user, closingPeriodId);
  }

  async closingChecklist(user: AuthenticatedIdentity, closingPeriodId: string) {
    return this.checklistHelper.closingChecklist(user, closingPeriodId);
  }

  async exportClosing(user: AuthenticatedIdentity, closingPeriodId: string, payload?: unknown) {
    return this.exportHelper.exportClosing(user, closingPeriodId, payload);
  }

  async getExportRunCsv(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    return this.exportHelper.getExportRunCsv(user, closingPeriodId, runId);
  }

  async getExportRunArtifact(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    return this.exportHelper.getExportRunArtifact(user, closingPeriodId, runId);
  }

  async postCloseCorrection(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    reason?: string,
  ): Promise<unknown> {
    return this.correctionHelper.postCloseCorrection(user, closingPeriodId, reason);
  }

  async applyPostCloseBookingCorrection(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    payload: unknown,
  ) {
    return this.correctionHelper.applyPostCloseBookingCorrection(user, closingPeriodId, payload);
  }
}
