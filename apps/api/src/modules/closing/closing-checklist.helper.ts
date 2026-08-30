/** Application helper for deterministic monthly-closing checklist evaluation. */
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { ClosingDb } from './closing-checklist-metrics.js';
import {
  executeClosingChecklist,
  type ClosingChecklistResponse,
} from './closing-checklist-execution.js';
import { EventOutboxHelper } from '../audit/public.js';
import { PersonHelper } from '../people/public.js';
import {
  buildRosterPlanVsActual,
  type RosterWithPlanShifts,
} from '../../application/roster/plan-vs-actual-coverage.js';
import { TimeThresholdPolicyHelper } from '../policy/public.js';

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
