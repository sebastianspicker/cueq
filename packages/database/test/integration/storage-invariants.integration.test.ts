import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PrismaClient, Role, RosterStatus, WorkflowType } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PostgreSQL storage invariants', () => {
  it('backfills legacy assignees idempotently and leaves assignments as the only shift authority', async () => {
    const migrationSql = await readFile(
      new URL(
        '../../prisma/migrations/20260827120000_remove_legacy_shift_person_id/migration.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const [backfillSql, dropColumnSuffix] = migrationSql.trim().split('\n\nALTER TABLE');
    if (!backfillSql || !dropColumnSuffix)
      throw new Error('Shift personId migration was not parseable.');

    await expect(
      prisma.$transaction(async (tx) => {
        const before = await tx.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'shifts' AND column_name = 'personId'
        `;
        expect(before).toEqual([]);
        await tx.$executeRawUnsafe('ALTER TABLE "shifts" ADD COLUMN "personId" TEXT');

        const suffix = randomUUID();
        const organizationUnit = await tx.organizationUnit.create({
          data: { name: `Shift storage test ${suffix}` },
        });
        const [firstPerson, secondPerson] = await Promise.all([
          tx.person.create({
            data: {
              firstName: 'Ada',
              lastName: 'Lovelace',
              email: `ada-${suffix}@example.invalid`,
              role: Role.EMPLOYEE,
              organizationUnitId: organizationUnit.id,
            },
          }),
          tx.person.create({
            data: {
              firstName: 'Grace',
              lastName: 'Hopper',
              email: `grace-${suffix}@example.invalid`,
              role: Role.EMPLOYEE,
              organizationUnitId: organizationUnit.id,
            },
          }),
        ]);
        const roster = await tx.roster.create({
          data: {
            organizationUnitId: organizationUnit.id,
            periodStart: new Date('2030-01-01T00:00:00.000Z'),
            periodEnd: new Date('2030-01-31T23:59:59.000Z'),
            status: RosterStatus.DRAFT,
          },
        });
        const legacyOnly = await tx.shift.create({
          data: {
            rosterId: roster.id,
            startTime: new Date('2030-01-02T08:00:00.000Z'),
            endTime: new Date('2030-01-02T16:00:00.000Z'),
            shiftType: 'EARLY',
            minStaffing: 1,
          },
        });
        const alreadyAssigned = await tx.shift.create({
          data: {
            rosterId: roster.id,
            startTime: new Date('2030-01-03T08:00:00.000Z'),
            endTime: new Date('2030-01-03T16:00:00.000Z'),
            shiftType: 'EARLY',
            minStaffing: 2,
            assignments: { create: [{ personId: firstPerson.id }, { personId: secondPerson.id }] },
          },
        });
        await tx.$executeRaw`
          UPDATE "shifts" SET "personId" = ${firstPerson.id} WHERE "id" = ${legacyOnly.id}
        `;
        await tx.$executeRaw`
          UPDATE "shifts" SET "personId" = ${firstPerson.id} WHERE "id" = ${alreadyAssigned.id}
        `;

        await tx.$executeRawUnsafe(backfillSql);
        await tx.$executeRawUnsafe(backfillSql);

        const assignments = await tx.shiftAssignment.findMany({
          where: { shiftId: { in: [legacyOnly.id, alreadyAssigned.id] } },
          orderBy: [{ shiftId: 'asc' }, { personId: 'asc' }],
          select: { id: true, shiftId: true, personId: true },
        });
        expect(assignments).toHaveLength(3);
        expect(assignments.filter((assignment) => assignment.shiftId === legacyOnly.id)).toEqual([
          expect.objectContaining({
            personId: firstPerson.id,
            id: expect.stringMatching(/^c[a-z0-9]{24}$/),
          }),
        ]);
        expect(
          assignments.filter((assignment) => assignment.shiftId === alreadyAssigned.id),
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ personId: firstPerson.id }),
            expect.objectContaining({ personId: secondPerson.id }),
          ]),
        );

        await tx.$executeRawUnsafe(`ALTER TABLE${dropColumnSuffix}`);
        const after = await tx.$queryRaw<Array<{ column_name: string }>>`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'shifts' AND column_name = 'personId'
        `;
        expect(after).toEqual([]);
        throw new Error('rollback shift personId migration test');
      }),
    ).rejects.toThrow('rollback shift personId migration test');
  });

  it('enforces one current workflow policy per type in a transaction that rolls back', async (context) => {
    const activePolicyTypes = new Set(
      (
        await prisma.workflowPolicy.findMany({
          where: { activeTo: null },
          select: { type: true },
        })
      ).map((policy) => policy.type),
    );
    const unusedType = Object.values(WorkflowType).find((type) => !activePolicyTypes.has(type));

    if (!unusedType) {
      context.skip(
        'Every workflow type already has a current policy; no safe isolated policy type exists.',
      );
      return;
    }

    await expect(
      prisma.$transaction(async (tx) => {
        const activeFrom = new Date('2030-01-01T00:00:00.000Z');
        await tx.workflowPolicy.create({
          data: {
            type: unusedType,
            escalationDeadlineHours: 24,
            escalationRoles: ['HR'],
            activeFrom,
          },
        });
        await tx.workflowPolicy.create({
          data: {
            type: unusedType,
            escalationDeadlineHours: 48,
            escalationRoles: ['ADMIN'],
            activeFrom: new Date('2030-01-02T00:00:00.000Z'),
          },
        });
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects audit entry updates and rolls back the inserted evidence row', async () => {
    const runId = randomUUID();

    await expect(
      prisma.$transaction(async (tx) => {
        const entry = await tx.auditEntry.create({
          data: {
            actorId: 'storage-invariants-test',
            action: 'STORAGE_INVARIANT_TEST',
            entityType: 'StorageInvariantTest',
            entityId: runId,
          },
        });
        await tx.auditEntry.update({
          where: { id: entry.id },
          data: { reason: 'mutation must be rejected' },
        });
      }),
    ).rejects.toThrow('audit_entries are append-only');

    await expect(prisma.auditEntry.count({ where: { entityId: runId } })).resolves.toBe(0);
  });
});
