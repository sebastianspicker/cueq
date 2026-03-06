import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Role } from '@cueq/database';
import {
  evaluateTimeRules as evaluateTimeRulesCore,
  calculateProratedMonthlyTarget,
} from '@cueq/core';
import { TimeRuleEvaluationRequestSchema } from '@cueq/shared';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from '../helpers/audit.helper';

const TIME_ENGINE_ALLOWED_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.SHIFT_PLANNER,
  Role.HR,
  Role.ADMIN,
]);

@Injectable()
export class TimeEngineDomainService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
  ) {}

  async timeEngineEvaluate(user: AuthenticatedIdentity, payload: unknown) {
    if (!TIME_ENGINE_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit time-engine rule evaluation.');
    }

    const actor = await this.resolvePersonForUser(user);
    const parsed = TimeRuleEvaluationRequestSchema.parse(payload ?? {});
    const result = evaluateTimeRulesCore(parsed);

    await this.auditHelper.appendAudit({
      actorId: actor.id,
      action: 'TIME_RULES_EVALUATED',
      entityType: 'TimeRuleEvaluation',
      entityId: `${parsed.week}:${new Date().toISOString()}`,
      after: {
        week: parsed.week,
        timezone: parsed.timezone ?? 'Europe/Berlin',
        intervalCount: parsed.intervals.length,
        violations: result.violations.length,
        warnings: result.warnings.length,
        surchargeLines: result.surchargeMinutes,
      },
    });

    return result;
  }

  async computeProratedTarget(payload: {
    month: string;
    actualHours: number;
    transitionAdjustmentHours?: number;
    segments: Array<{ from: string; to: string; weeklyHours: number }>;
  }) {
    return calculateProratedMonthlyTarget(payload);
  }

  private async resolvePersonForUser(user: AuthenticatedIdentity) {
    const personBySubject = await this.prisma.person.findFirst({
      where: {
        OR: [{ id: user.subject }, { externalId: user.subject }],
      },
      select: { id: true },
    });

    if (personBySubject) {
      return personBySubject;
    }

    const person = await this.prisma.person.findUnique({
      where: { email: user.email },
      select: { id: true },
    });

    if (!person) {
      throw new ForbiddenException('Authenticated person was not found.');
    }

    return person;
  }
}
