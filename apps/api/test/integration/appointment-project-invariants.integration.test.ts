/** Synthetic migrated-PostgreSQL proofs; these are excluded from the default unit suite. */
import { PrismaClient, type Prisma } from '@cueq/database';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { AssignmentHelper } from '../../src/modules/people/assignment.helper.js';
import type { PrismaService } from '../../src/persistence/prisma.service.js';

const prisma = new PrismaClient();
const employee = 'c000000000000000000000100';
beforeAll(() => prisma.$connect());
afterAll(() => prisma.$disconnect());

async function appointment(tx: Prisma.TransactionClient) {
  const person = await tx.person.findUniqueOrThrow({ where: { id: employee } });
  const reference = await tx.employmentTerm.findFirstOrThrow({
    where: { assignment: { personId: employee } },
  });
  const organization = await tx.organizationUnit.create({
    data: { name: 'Synthetic concurrent research unit' },
  });
  const assignment = await tx.employmentAssignment.create({
    data: {
      personId: person.id,
      label: 'Synthetic research appointment',
      legacy: false,
      sourceSystem: 'CUEQ',
    },
  });
  const boundary = new Date('2026-03-15T00:00:00Z');
  await tx.employmentTerm.createMany({
    data: [
      {
        assignmentId: assignment.id,
        employmentGroupId: reference.employmentGroupId,
        holidayCalendarId: reference.holidayCalendarId,
        effectiveFrom: new Date('2026-03-01T00:00:00Z'),
        effectiveTo: boundary,
        organizationUnitId: organization.id,
        weeklyHours: 20,
        dailyTargetHours: 4,
        workingDays: [1, 2, 3, 4, 5],
        policyReferences: {},
      },
      {
        assignmentId: assignment.id,
        employmentGroupId: reference.employmentGroupId,
        holidayCalendarId: reference.holidayCalendarId,
        effectiveFrom: boundary,
        effectiveTo: new Date('2026-04-01T00:00:00Z'),
        organizationUnitId: organization.id,
        weeklyHours: 10,
        dailyTargetHours: 2,
        workingDays: [1, 2, 3, 4, 5],
        policyReferences: {},
      },
    ],
  });
  return { person, organization, assignment };
}

it('requires explicit concurrent appointment selection and splitting at incompatible terms', async () => {
  const rollback = new Error('ROLLBACK_SYNTHETIC_APPOINTMENT');
  let assignmentId = '';
  await expect(
    prisma.$transaction(async (tx) => {
      const fixture = await appointment(tx);
      assignmentId = fixture.assignment.id;
      const helper = new AssignmentHelper(tx as unknown as PrismaService);
      const from = new Date('2026-03-10T08:00:00Z');
      const to = new Date('2026-03-10T09:00:00Z');
      await expect(helper.resolveInterval(employee, from, to, undefined, tx)).rejects.toThrow();
      const selected = await helper.resolveInterval(employee, from, to, assignmentId, tx);
      expect(selected.organizationUnitId).toBe(fixture.organization.id);
      expect(Number(selected.term.weeklyHours)).toBe(20);
      await expect(
        helper.resolveInterval(employee, from, new Date('2026-03-20T09:00:00Z'), assignmentId, tx),
      ).rejects.toThrow('Split the request');
      throw rollback;
    }),
  ).rejects.toBe(rollback);
  expect(await prisma.employmentAssignment.findUnique({ where: { id: assignmentId } })).toBeNull();
});

it('enforces allocation ceilings in PostgreSQL and rolls the entire fixture back', async () => {
  let bookingId = '';
  await expect(
    prisma.$transaction(async (tx) => {
      const f = await appointment(tx);
      const type = await tx.timeType.findFirstOrThrow({ where: { category: 'WORK' } });
      const booking = await tx.booking.create({
        data: {
          personId: employee,
          assignmentId: f.assignment.id,
          timeTypeId: type.id,
          startTime: new Date('2026-03-10T08:00:00Z'),
          endTime: new Date('2026-03-10T09:00:00Z'),
          source: 'WEB',
        },
      });
      bookingId = booking.id;
      const project = await tx.project.create({
        data: {
          code: `synthetic-${f.assignment.id}`,
          name: 'Synthetic research project',
          organizationUnitId: f.organization.id,
          managerId: employee,
        },
      });
      await tx.projectTimeAllocation.create({
        data: {
          projectId: project.id,
          bookingId,
          personId: employee,
          assignmentId: f.assignment.id,
          minutes: 61,
        },
      });
    }),
  ).rejects.toThrow();
  expect(bookingId).not.toBe('');
  expect(await prisma.booking.findUnique({ where: { id: bookingId } })).toBeNull();
});
