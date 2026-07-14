import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/persistence/prisma.service';
import { SEED_IDS } from '../../src/test-utils/seed-ids';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';

describe('Concurrent roster mutation invariants', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    seedPhase2Data();
  });

  afterAll(async () => {
    await app?.close();
  });

  function post(path: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${TOKENS.planner}`)
      .send(body);
  }

  it('creates exactly one overlapping roster and its audit record', async () => {
    const body = {
      organizationUnitId: SEED_IDS.ouSecurity,
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-31T23:59:59.000Z',
    };
    const responses = await Promise.all([post('/v1/rosters', body), post('/v1/rosters', body)]);

    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 400 || status === 409)).toHaveLength(1);
    const rosters = await prisma.roster.findMany({
      where: {
        organizationUnitId: body.organizationUnitId,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
      },
    });
    expect(rosters).toHaveLength(1);
    expect(
      await prisma.auditEntry.count({
        where: { action: 'ROSTER_CREATED', entityType: 'Roster', entityId: rosters[0]!.id },
      }),
    ).toBe(1);
  });

  it('never publishes a roster with a staffing shortfall while an assignment races it', async () => {
    const roster = await post('/v1/rosters', {
      organizationUnitId: SEED_IDS.ouSecurity,
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: '2026-09-30T23:59:59.000Z',
    });
    expect(roster.status).toBe(201);

    const shift = await post(`/v1/rosters/${roster.body.id}/shifts`, {
      startTime: '2026-09-05T08:00:00.000Z',
      endTime: '2026-09-05T16:00:00.000Z',
      shiftType: 'EARLY',
      minStaffing: 1,
    });
    expect(shift.status).toBe(201);

    const [assignment, publication] = await Promise.all([
      post(`/v1/rosters/${roster.body.id}/shifts/${shift.body.id}/assignments`, {
        personId: SEED_IDS.personPlanner,
      }),
      post(`/v1/rosters/${roster.body.id}/publish`, {}),
    ]);

    expect(
      [assignment.status, publication.status].every(
        (status) => status === 201 || status === 400 || status === 409,
      ),
    ).toBe(true);
    const persisted = await prisma.roster.findUniqueOrThrow({
      where: { id: roster.body.id },
      include: { shifts: { include: { assignments: true } } },
    });
    if (persisted.status === 'PUBLISHED') {
      expect(persisted.shifts.every((item) => item.assignments.length >= item.minStaffing)).toBe(
        true,
      );
    }
  });

  it('serializes overlapping assignments for one person across different rosters', async () => {
    const rosterData = {
      organizationUnitId: SEED_IDS.ouSecurity,
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: new Date('2026-10-31T23:59:59.000Z'),
    };
    // Create the deliberately invalid overlapping roster pair directly. The
    // public create endpoint correctly prevents this state; this fixture
    // isolates the cross-roster person-lock invariant for legacy/imported data.
    const [firstRoster, secondRoster] = await Promise.all([
      prisma.roster.create({ data: rosterData }),
      prisma.roster.create({ data: rosterData }),
    ]);
    const shiftData = {
      startTime: new Date('2026-10-05T08:00:00.000Z'),
      endTime: new Date('2026-10-05T16:00:00.000Z'),
      shiftType: 'EARLY',
      minStaffing: 1,
    };
    const [firstShift, secondShift] = await Promise.all([
      prisma.shift.create({ data: { ...shiftData, rosterId: firstRoster.id } }),
      prisma.shift.create({ data: { ...shiftData, rosterId: secondRoster.id } }),
    ]);

    const responses = await Promise.all([
      post(`/v1/rosters/${firstRoster.id}/shifts/${firstShift.id}/assignments`, {
        personId: SEED_IDS.personPlanner,
      }),
      post(`/v1/rosters/${secondRoster.id}/shifts/${secondShift.id}/assignments`, {
        personId: SEED_IDS.personPlanner,
      }),
    ]);

    expect(responses.filter(({ status }) => status === 201)).toHaveLength(1);
    expect(responses.filter(({ status }) => status === 400 || status === 409)).toHaveLength(1);
    const persistedAssignments = await prisma.shiftAssignment.findMany({
      where: {
        personId: SEED_IDS.personPlanner,
        shiftId: { in: [firstShift.id, secondShift.id] },
      },
      select: { id: true },
    });
    expect(persistedAssignments).toHaveLength(1);
    expect(
      await prisma.auditEntry.count({
        where: {
          action: 'SHIFT_ASSIGNED',
          entityType: 'ShiftAssignment',
          entityId: persistedAssignments[0]!.id,
        },
      }),
    ).toBe(1);
  });
});
