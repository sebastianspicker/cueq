import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';
import { PersonHelper } from '../helpers/person.helper';

@Injectable()
export class DashboardBookingsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PersonHelper) private readonly personHelper: PersonHelper,
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

  async dashboard(user: AuthenticatedIdentity): Promise<unknown> {
    const person = await this.personHelper.personForUser(user);

    // Query workTimeModel separately – PersonHelper's generic include option
    // does not propagate Prisma return types reliably through conditional spread.
    const workTimeModel = person.workTimeModelId
      ? await this.prisma.workTimeModel.findUnique({ where: { id: person.workTimeModelId } })
      : null;

    const now = new Date();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const dayEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );

    const [latestTimeAccount, todayBookingsCount, totalBookingsCount, clockInType] =
      await Promise.all([
        this.prisma.timeAccount.findFirst({
          where: { personId: person.id },
          orderBy: { periodStart: 'desc' },
        }),
        this.prisma.booking.count({
          where: {
            personId: person.id,
            startTime: { gte: dayStart, lte: dayEnd },
          },
        }),
        this.prisma.booking.count({
          where: { personId: person.id },
        }),
        this.prisma.timeType.findFirst({
          where: { code: 'WORK' },
          select: { id: true },
        }),
      ]);

    const dailyTarget = Number(
      workTimeModel?.dailyTargetHours ?? Number(workTimeModel?.weeklyHours ?? 0) / 5,
    );
    const hasFirstBooking = totalBookingsCount > 0;

    return {
      personId: person.id,
      modelName: workTimeModel?.name ?? 'N/A',
      todayTargetHours: Number(dailyTarget.toFixed(2)),
      currentBalanceHours: Number((latestTimeAccount?.balance ?? 0).toFixed(2)),
      todayBookingsCount,
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
