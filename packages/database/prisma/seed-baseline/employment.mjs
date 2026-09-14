/** Recreates identifiable reference appointments for the synthetic baseline only. */
import { createHash } from 'node:crypto';
import reference from '../reference-employment.json' with { type: 'json' };

export function legacyAssignmentId(personId) {
  return `c${createHash('md5').update(`cueq:assignment:${personId}`).digest('hex').slice(0, 24)}`;
}

export async function seedEmployment(prisma) {
  await prisma.employmentGroup.upsert({
    where: { id: reference.groupId },
    update: {},
    create: {
      id: reference.groupId,
      code: 'LEGACY_UNSPECIFIED',
      version: 1,
      name: 'Legacy TV-L reference configuration',
      legacyReference: true,
      leavePolicy: reference.leavePolicy,
    },
  });
  await prisma.holidayCalendar.upsert({
    where: { id: reference.calendarId },
    update: {},
    create: {
      id: reference.calendarId,
      code: 'LEGACY_NRW_2026',
      version: 1,
      name: 'Legacy curated NRW calendar',
      legacyReference: true,
      holidayDates: reference.holidayDates,
    },
  });
  let cursor;
  for (;;) {
    const people = await prisma.person.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      include: { workTimeModel: true },
      orderBy: { id: 'asc' },
      take: 500,
    });
    if (!people.length) break;
    await prisma.employmentAssignment.createMany({
      data: people.map((person) => ({
        id: legacyAssignmentId(person.id),
        personId: person.id,
        sourceSystem: 'legacy-hr',
        externalAppointmentId: person.id,
        label: 'Legacy appointment',
        legacy: true,
        employmentStartDate: person.employmentStartDate,
        employmentEndDate: person.employmentEndDate,
        createdAt: person.createdAt,
      })),
    });
    await prisma.employmentTerm.createMany({
      data: people.map((person) => ({
        id: `c${createHash('md5').update(`cueq:term:${person.id}`).digest('hex').slice(0, 24)}`,
        assignmentId: legacyAssignmentId(person.id),
        organizationUnitId: person.organizationUnitId,
        supervisorId: person.supervisorId,
        workTimeModelId: person.workTimeModelId,
        weeklyHours: person.workTimeModel?.weeklyHours ?? null,
        dailyTargetHours: person.workTimeModel?.dailyTargetHours ?? null,
        workingDays: [1, 2, 3, 4, 5],
        employmentGroupId: reference.groupId,
        holidayCalendarId: reference.calendarId,
        policyReferences: { leave: 'leave-tvl-default@1', origin: 'legacy-reference' },
        createdAt: person.createdAt,
      })),
    });
    cursor = people.at(-1).id;
  }
}
