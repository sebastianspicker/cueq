/** Seeds deterministic time types, rostering, bookings, on-call, and absence data. */
import {
  AbsenceStatus,
  AbsenceType,
  BookingSource,
  OnCallRotationType,
  RosterStatus,
  TimeTypeCategory,
} from '@prisma/client';

export async function seedTimeOperations(prisma, IDs) {
  await prisma.timeType.createMany({
    data: [
      {
        id: IDs.timeTypeWork,
        code: 'WORK',
        name: 'Arbeit',
        nameEn: 'Work',
        category: TimeTypeCategory.WORK,
      },
      {
        id: IDs.timeTypePause,
        code: 'PAUSE',
        name: 'Pause',
        nameEn: 'Break',
        category: TimeTypeCategory.PAUSE,
      },
      {
        id: IDs.timeTypeOnCall,
        code: 'ON_CALL',
        name: 'Rufbereitschaft',
        nameEn: 'On-call',
        category: TimeTypeCategory.ON_CALL,
      },
      {
        id: IDs.timeTypeDeployment,
        code: 'DEPLOYMENT',
        name: 'Einsatz',
        nameEn: 'Deployment',
        category: TimeTypeCategory.DEPLOYMENT,
      },
    ],
  });

  await prisma.roster.create({
    data: {
      id: IDs.rosterCurrent,
      organizationUnitId: IDs.ouSecurity,
      periodStart: new Date('2026-03-01T00:00:00.000Z'),
      periodEnd: new Date('2026-03-31T23:59:59.000Z'),
      status: RosterStatus.PUBLISHED,
      publishedAt: new Date('2026-02-25T10:00:00.000Z'),
    },
  });

  await prisma.shift.create({
    data: {
      id: IDs.shiftNight,
      rosterId: IDs.rosterCurrent,
      startTime: new Date('2026-03-08T22:00:00.000Z'),
      endTime: new Date('2026-03-09T06:00:00.000Z'),
      shiftType: 'NIGHT',
      minStaffing: 1,
    },
  });

  await prisma.shiftAssignment.create({
    data: {
      shiftId: IDs.shiftNight,
      personId: IDs.personPlanner,
    },
  });

  await prisma.booking.createMany({
    data: [
      {
        id: IDs.bookingEmployeeIn,
        personId: IDs.personEmployee,
        timeTypeId: IDs.timeTypeWork,
        startTime: new Date('2026-03-02T08:00:00.000Z'),
        endTime: new Date('2026-03-02T12:00:00.000Z'),
        source: BookingSource.WEB,
      },
      {
        id: IDs.bookingEmployeeOut,
        personId: IDs.personEmployee,
        timeTypeId: IDs.timeTypeWork,
        startTime: new Date('2026-03-02T13:00:00.000Z'),
        endTime: new Date('2026-03-02T17:00:00.000Z'),
        source: BookingSource.WEB,
      },
      {
        id: IDs.bookingOncallDeployment,
        personId: IDs.personItOncall,
        timeTypeId: IDs.timeTypeDeployment,
        startTime: new Date('2026-03-14T01:10:00.000Z'),
        endTime: new Date('2026-03-14T02:20:00.000Z'),
        source: BookingSource.MANUAL,
      },
    ],
  });

  await prisma.onCallRotation.create({
    data: {
      id: IDs.onCallRotation,
      personId: IDs.personItOncall,
      organizationUnitId: IDs.ouIt,
      startTime: new Date('2026-03-09T00:00:00.000Z'),
      endTime: new Date('2026-03-15T23:59:59.000Z'),
      rotationType: OnCallRotationType.WEEKLY,
      note: 'Synthetic weekly rotation',
    },
  });

  await prisma.onCallDeployment.create({
    data: {
      id: IDs.onCallDeployment,
      personId: IDs.personItOncall,
      rotationId: IDs.onCallRotation,
      startTime: new Date('2026-03-14T01:10:00.000Z'),
      endTime: new Date('2026-03-14T02:20:00.000Z'),
      remote: true,
      ticketReference: 'INC-2026-001',
      eventReference: 'EVT-2026-001',
      description: 'Synthetic remote deployment',
    },
  });

  await prisma.absence.createMany({
    data: [
      {
        id: IDs.absenceAnnual,
        personId: IDs.personEmployee,
        type: AbsenceType.ANNUAL_LEAVE,
        startDate: new Date('2026-04-10T00:00:00.000Z'),
        endDate: new Date('2026-04-12T00:00:00.000Z'),
        days: 1.5,
        status: AbsenceStatus.APPROVED,
        note: 'Urlaub',
      },
      {
        id: IDs.absenceSick,
        personId: IDs.personPlanner,
        type: AbsenceType.SICK,
        startDate: new Date('2026-03-11T00:00:00.000Z'),
        endDate: new Date('2026-03-12T00:00:00.000Z'),
        days: 2,
        status: AbsenceStatus.APPROVED,
        note: 'Krank',
      },
    ],
  });
}
