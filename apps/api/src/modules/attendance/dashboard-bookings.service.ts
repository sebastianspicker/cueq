import { cursorPage } from '../../persistence/queries/cursor-page.js';
import { berlinDayBounds } from './berlin-day.js';
import { toBookingDto } from './booking-response.mapper.js';
/** Builds the authenticated caller's booking-focused dashboard data. */
import { Inject, Injectable } from '@nestjs/common';
import { AssignmentContextSchema } from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import type { AuthenticatedIdentity } from '../../platform/auth/auth.types.js';
import { AssignmentHelper, PersonHelper } from '../people/public.js';
import { targetHoursForBerlinDay } from './time-account-calculation.helper.js';

/**
 * Builds the caller-scoped booking summary used by the operational dashboard.
 */
@Injectable()
export class DashboardBookingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
    @Inject(AssignmentHelper) private readonly assignmentHelper: AssignmentHelper,
  ) {}

  async me(user: AuthenticatedIdentity): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);

    return {
      id: person.id,
      email: person.email,
      role: person.role,
      organizationUnitId: person.organizationUnitId,
      firstName: person.firstName,
      lastName: person.lastName,
    };
  }

  async dashboard(user: AuthenticatedIdentity, query: unknown = {}): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);
    const parsed = AssignmentContextSchema.parse(query);
    const now = new Date();
    const { dayStart, dayEnd } = berlinDayBounds(now);
    const resolved = await this.assignmentHelper.resolveInterval(
      person.id,
      dayStart,
      dayEnd,
      parsed.assignmentId,
    );
    const assignmentId = resolved.assignment.id;
    const bookingWhere = {
      personId: person.id,
      assignmentId,
      startTime: { gte: dayStart, lt: dayEnd },
    };
    const [
      latestTimeAccount,
      todayBookingsCount,
      firstBooking,
      clockInType,
      todayBookings,
      worked,
    ] = await this.prisma.$transaction(
      [
        this.prisma.timeAccount.findFirst({
          where: { personId: person.id, assignmentId },
          orderBy: { periodStart: 'desc' },
        }),
        this.prisma.booking.count({ where: bookingWhere }),
        this.prisma.booking.findFirst({
          where: { personId: person.id, assignmentId },
          select: { id: true },
        }),
        this.prisma.timeType.findFirst({ where: { code: 'WORK' }, select: { id: true } }),
        this.prisma.booking.findMany({
          where: bookingWhere,
          orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
          take: 51,
          include: { timeType: true },
        }),
        this.prisma.$queryRaw<Array<{ milliseconds: number }>>`
            SELECT COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM (COALESCE("endTime", ${now}) - "startTime")) * 1000)), 0)::double precision AS milliseconds
            FROM "bookings" WHERE "personId" = ${person.id} AND "assignmentId" = ${assignmentId} AND "startTime" >= ${dayStart} AND "startTime" < ${dayEnd}
          `,
      ],
      { isolationLevel: 'RepeatableRead' },
    );

    const dailyTarget = targetHoursForBerlinDay(resolved.term, now);
    const hasFirstBooking = firstBooking !== null;

    return {
      personId: person.id,
      assignmentId,
      modelName: resolved.term.workTimeModel?.name ?? 'N/A',
      todayTargetHours: Number(dailyTarget.toFixed(2)),
      currentBalanceHours: Number((latestTimeAccount?.balance ?? 0).toFixed(2)),
      todayBookingsCount,
      todayWorkedMilliseconds: worked[0]?.milliseconds ?? 0,
      dayStart: dayStart.toISOString(),
      dayEnd: dayEnd.toISOString(),
      todayBookings: cursorPage(
        todayBookings,
        50,
        'startTime',
        (row) => row.startTime,
        toBookingDto,
      ),
      hasFirstBooking,
      showOrientation: !hasFirstBooking,
      clockInTimeTypeId: clockInType?.id ?? null,
      period: latestTimeAccount
        ? {
            start: latestTimeAccount.periodStart.toISOString(),
            end: latestTimeAccount.periodEnd.toISOString(),
          }
        : null,
      quickActions: ['CLOCK_IN', 'REQUEST_LEAVE'],
      now: now.toISOString(),
    };
  }
}
