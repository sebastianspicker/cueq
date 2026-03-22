import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  evaluateTimeRules as evaluateTimeRulesCore,
  calculateProratedMonthlyTarget,
} from '@cueq/core';
import { TimeRuleEvaluationRequestSchema } from '@cueq/shared';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { AuditHelper } from '../helpers/audit.helper';
import { PersonHelper } from '../helpers/person.helper';
import { TIME_ENGINE_ALLOWED_ROLES } from '../helpers/role-constants';

@Injectable()
export class TimeEngineDomainService {
  constructor(
    @Inject(AuditHelper) private readonly auditHelper: AuditHelper,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
  ) {}

  async timeEngineEvaluate(user: AuthenticatedIdentity, payload: unknown) {
    if (!TIME_ENGINE_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit time-engine rule evaluation.');
    }

    const actor = await this.personHelper.personForUser(user);
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
}
