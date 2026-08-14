/** Application facade for deterministic monthly-closing checklist evaluation. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';
import type { ClosingDb } from './closing-checklist-metrics.js';
import {
  executeClosingChecklist,
  type ClosingChecklistResponse,
} from './closing-checklist-execution.js';
import { EventOutboxHelper } from './event-outbox.helper.js';
import { PersonHelper } from './person.helper.js';
import { buildRosterPlanVsActual, type RosterWithPlanShifts } from './plan-vs-actual.helper.js';
import { TimeThresholdPolicyHelper } from './time-threshold-policy.helper.js';

@Injectable()
export class ClosingChecklistHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
    @Inject(TimeThresholdPolicyHelper)
    private readonly timeThresholdPolicyHelper: TimeThresholdPolicyHelper,
  ) {}

  async buildPlanVsActualForRoster(roster: RosterWithPlanShifts, db: ClosingDb = this.prisma) {
    return buildRosterPlanVsActual(db, roster);
  }

  async closingChecklist(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    db: ClosingDb = this.prisma,
    emitViolationEvent = true,
  ): Promise<ClosingChecklistResponse> {
    // prettier-ignore
    return executeClosingChecklist(this.dependencies(), user, closingPeriodId, db, emitViolationEvent);
  }

  private dependencies() {
    // prettier-ignore
    return { prisma: this.prisma, personHelper: this.personHelper, eventOutboxHelper: this.eventOutboxHelper, timeThresholdPolicyHelper: this.timeThresholdPolicyHelper };
  }
}
