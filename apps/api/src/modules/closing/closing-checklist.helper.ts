/** Application helper for deterministic monthly-closing checklist evaluation. */
import { Inject, Injectable } from '@nestjs/common';
import { TimeTypeCategory } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import type { ClosingDb } from './closing-checklist-metrics.js';
import {
  executeClosingChecklist,
  type ClosingChecklistResponse,
} from './closing-checklist-execution.js';
import { EventOutboxHelper } from '../audit/public.js';
import { AssignmentHelper, PersonHelper } from '../people/public.js';
import {
  buildRosterPlanVsActualFromBookings,
  type RosterWithPlanShifts,
} from '../../application/roster/plan-vs-actual-coverage.js';
import { TimeThresholdPolicyHelper } from '../policy/public.js';
import { TIME_ACCOUNTS_PORT, type TimeAccountsPort } from '../attendance/public.js';

@Injectable()
export class ClosingChecklistHelper {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AssignmentHelper) private readonly assignmentHelper: AssignmentHelper,
    @Inject(EventOutboxHelper) private readonly eventOutboxHelper: EventOutboxHelper,
    @Inject(TimeThresholdPolicyHelper)
    private readonly timeThresholdPolicyHelper: TimeThresholdPolicyHelper,
    @Inject(TIME_ACCOUNTS_PORT) private readonly timeAccounts: TimeAccountsPort,
  ) {}

  async buildPlanVsActualForRoster(roster: RosterWithPlanShifts, db: ClosingDb = this.prisma) {
    const bookings = await db.booking.findMany({
      where: {
        assignment: {
          terms: {
            some: {
              organizationUnitId: roster.organizationUnitId,
              AND: [
                { OR: [{ effectiveFrom: null }, { effectiveFrom: { lt: roster.periodEnd } }] },
                { OR: [{ effectiveTo: null }, { effectiveTo: { gt: roster.periodStart } }] },
              ],
            },
          },
        },
        timeType: {
          category: { in: [TimeTypeCategory.WORK, TimeTypeCategory.DEPLOYMENT] },
        },
        startTime: { lt: roster.periodEnd },
        endTime: { gt: roster.periodStart },
      },
      select: {
        personId: true,
        assignmentId: true,
        startTime: true,
        endTime: true,
        timeType: { select: { category: true } },
      },
    });
    const eligible = [];
    for (const booking of bookings) {
      const employment = await this.assignmentHelper.resolveInterval(
        booking.personId,
        booking.startTime,
        booking.endTime ?? undefined,
        booking.assignmentId,
        db,
      );
      if (employment.organizationUnitId === roster.organizationUnitId) eligible.push(booking);
    }
    return buildRosterPlanVsActualFromBookings(roster, eligible);
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
    return { prisma: this.prisma, personHelper: this.personHelper, assignmentHelper: this.assignmentHelper, eventOutboxHelper: this.eventOutboxHelper, timeThresholdPolicyHelper: this.timeThresholdPolicyHelper, timeAccounts: this.timeAccounts };
  }
}
