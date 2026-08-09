import { AbsenceStatus, AbsenceType, BookingSource } from '@prisma/client';

async function seedDemoShifts(prisma, ids) {
  await prisma.shift.update({
    where: { id: ids.shiftNight },
    data: {
      personId: ids.personPlanner,
      minStaffing: 2,
      shiftType: 'NIGHT',
      startTime: new Date('2026-03-08T22:00:00.000Z'),
      endTime: new Date('2026-03-09T06:00:00.000Z'),
    },
  });

  await prisma.shift.upsert({
    where: { id: ids.shiftMorning },
    create: {
      id: ids.shiftMorning,
      rosterId: ids.rosterCurrent,
      personId: ids.personSecurity2,
      shiftType: 'EARLY',
      minStaffing: 1,
      startTime: new Date('2026-03-10T06:00:00.000Z'),
      endTime: new Date('2026-03-10T14:00:00.000Z'),
    },
    update: {
      personId: ids.personSecurity2,
      shiftType: 'EARLY',
      minStaffing: 1,
      startTime: new Date('2026-03-10T06:00:00.000Z'),
      endTime: new Date('2026-03-10T14:00:00.000Z'),
    },
  });

  await prisma.shift.upsert({
    where: { id: ids.shiftLate },
    create: {
      id: ids.shiftLate,
      rosterId: ids.rosterCurrent,
      personId: ids.personSecurity3,
      shiftType: 'LATE',
      minStaffing: 2,
      startTime: new Date('2026-03-10T14:00:00.000Z'),
      endTime: new Date('2026-03-10T22:00:00.000Z'),
    },
    update: {
      personId: ids.personSecurity3,
      shiftType: 'LATE',
      minStaffing: 2,
      startTime: new Date('2026-03-10T14:00:00.000Z'),
      endTime: new Date('2026-03-10T22:00:00.000Z'),
    },
  });
}

async function seedDemoAssignments(prisma, ids) {
  const assignments = [
    { shiftId: ids.shiftNight, personId: ids.personPlanner },
    { shiftId: ids.shiftNight, personId: ids.personSecurity1 },
    { shiftId: ids.shiftMorning, personId: ids.personSecurity2 },
    { shiftId: ids.shiftLate, personId: ids.personSecurity3 },
    { shiftId: ids.shiftLate, personId: ids.personSecurity4 },
  ];
  for (const assignment of assignments) {
    await prisma.shiftAssignment.upsert({
      where: { shiftId_personId: assignment },
      create: assignment,
      update: {},
    });
  }
}

async function seedDemoSecurityBookings(prisma, ids) {
  const securityBookings = [
    {
      id: ids.bookingSecurityNightPlanner,
      personId: ids.personPlanner,
      shiftId: ids.shiftNight,
      startTime: '2026-03-08T22:00:00.000Z',
      endTime: '2026-03-09T06:00:00.000Z',
    },
    {
      id: ids.bookingSecurityNightGuard,
      personId: ids.personSecurity1,
      shiftId: ids.shiftNight,
      startTime: '2026-03-08T22:15:00.000Z',
      endTime: '2026-03-09T05:55:00.000Z',
    },
    {
      id: ids.bookingSecurityMorning,
      personId: ids.personSecurity2,
      shiftId: ids.shiftMorning,
      startTime: '2026-03-10T06:00:00.000Z',
      endTime: '2026-03-10T14:00:00.000Z',
    },
    {
      id: ids.bookingSecurityLateA,
      personId: ids.personSecurity3,
      shiftId: ids.shiftLate,
      startTime: '2026-03-10T14:00:00.000Z',
      endTime: '2026-03-10T22:00:00.000Z',
    },
    {
      id: ids.bookingSecurityLateB,
      personId: ids.personSecurity4,
      shiftId: ids.shiftLate,
      startTime: '2026-03-10T14:05:00.000Z',
      endTime: '2026-03-10T21:50:00.000Z',
    },
  ];
  for (const booking of securityBookings) {
    const values = {
      personId: booking.personId,
      timeTypeId: ids.timeTypeWork,
      shiftId: booking.shiftId,
      startTime: new Date(booking.startTime),
      endTime: new Date(booking.endTime),
      source: BookingSource.WEB,
    };
    await prisma.booking.upsert({
      where: { id: booking.id },
      create: { id: booking.id, ...values },
      update: values,
    });
  }
}

async function seedDemoAbsences(prisma, ids) {
  const absences = [
    {
      id: ids.absenceEmployeeRequested,
      personId: ids.personEmployee,
      type: AbsenceType.SPECIAL_LEAVE,
      startDate: '2026-03-18T00:00:00.000Z',
      endDate: '2026-03-19T00:00:00.000Z',
      days: 2,
      status: AbsenceStatus.REQUESTED,
      note: 'Demo request for committee participation',
    },
    {
      id: ids.absenceEmployeeRejected,
      personId: ids.personEmployee,
      type: AbsenceType.TRAINING,
      startDate: '2026-03-24T00:00:00.000Z',
      endDate: '2026-03-24T00:00:00.000Z',
      days: 1,
      status: AbsenceStatus.REJECTED,
      note: 'Demo rejected training request',
    },
    {
      id: ids.absenceSecurityApproved,
      personId: ids.personSecurity1,
      type: AbsenceType.ANNUAL_LEAVE,
      startDate: '2026-03-05T00:00:00.000Z',
      endDate: '2026-03-06T00:00:00.000Z',
      days: 2,
      status: AbsenceStatus.APPROVED,
      note: 'Demo approved leave',
    },
    {
      id: ids.absenceSecurityCancelled,
      personId: ids.personSecurity2,
      type: AbsenceType.TRAINING,
      startDate: '2026-03-20T00:00:00.000Z',
      endDate: '2026-03-20T00:00:00.000Z',
      days: 1,
      status: AbsenceStatus.CANCELLED,
      note: 'Demo cancelled absence',
    },
  ];
  for (const absence of absences) {
    const { id, ...absenceValues } = absence;
    const values = {
      ...absenceValues,
      startDate: new Date(absence.startDate),
      endDate: new Date(absence.endDate),
    };
    await prisma.absence.upsert({
      where: { id },
      create: { id, ...values },
      update: values,
    });
  }
}

export async function seedDemoScheduling(prisma, ids) {
  await seedDemoShifts(prisma, ids);
  await seedDemoAssignments(prisma, ids);
  await seedDemoSecurityBookings(prisma, ids);
  await seedDemoAbsences(prisma, ids);
}
