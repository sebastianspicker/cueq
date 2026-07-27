import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../src/persistence/prisma.service.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';

describe('Concurrent mutation invariants', () => {
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

  function post(path: string, token: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(path)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('persists one booking, audit, and outbox event for concurrent overlapping requests', async () => {
    const body = {
      personId: SEED_IDS.personEmployee,
      timeTypeId: SEED_IDS.timeTypeWork,
      startTime: '2026-05-04T08:00:00.000Z',
      endTime: '2026-05-04T12:00:00.000Z',
      source: 'WEB',
    };

    const responses = await Promise.all([
      post('/v1/bookings', TOKENS.employee, body),
      post('/v1/bookings', TOKENS.employee, body),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const booking = await prisma.booking.findFirstOrThrow({
      where: {
        personId: body.personId,
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
      },
    });
    expect(
      await prisma.booking.count({
        where: { personId: body.personId, startTime: new Date(body.startTime) },
      }),
    ).toBe(1);
    expect(
      await prisma.auditEntry.count({
        where: { action: 'BOOKING_CREATED', entityId: booking.id },
      }),
    ).toBe(1);
    expect(
      await prisma.domainEventOutbox.count({
        where: { eventType: 'booking.created', aggregateId: booking.id },
      }),
    ).toBe(1);
  });

  it('persists one absence and one workflow for concurrent overlapping requests', async () => {
    const body = {
      personId: SEED_IDS.personEmployee,
      type: 'ANNUAL_LEAVE',
      startDate: '2026-05-18',
      endDate: '2026-05-19',
      note: 'Concurrent leave request',
    };

    const responses = await Promise.all([
      post('/v1/absences', TOKENS.employee, body),
      post('/v1/absences', TOKENS.employee, body),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const absence = await prisma.absence.findFirstOrThrow({
      where: {
        personId: body.personId,
        startDate: new Date(`${body.startDate}T00:00:00.000Z`),
      },
    });
    expect(
      await prisma.absence.count({
        where: { personId: body.personId, startDate: absence.startDate },
      }),
    ).toBe(1);
    expect(
      await prisma.workflowInstance.count({
        where: { type: 'LEAVE_REQUEST', entityType: 'Absence', entityId: absence.id },
      }),
    ).toBe(1);
  });

  it('stores one terminal receipt and booking for concurrent identical batches', async () => {
    const body = {
      terminalId: 'T-CONCURRENT-01',
      sourceFile: 'concurrent.csv',
      records: [
        {
          personId: SEED_IDS.personPlanner,
          timeTypeCode: 'WORK',
          startTime: '2026-05-06T08:00:00.000Z',
          endTime: '2026-05-06T12:00:00.000Z',
        },
      ],
    };

    const responses = await Promise.all([
      post('/v1/terminal/sync/batches', TOKENS.hr, body),
      post('/v1/terminal/sync/batches', TOKENS.hr, body),
    ]);

    expect(responses.some(({ status }) => status === 201)).toBe(true);
    expect(responses.every(({ status }) => status === 201 || status === 409)).toBe(true);
    expect(await prisma.terminalSyncBatch.count({ where: { terminalId: body.terminalId } })).toBe(
      1,
    );
    expect(
      await prisma.booking.count({
        where: {
          personId: SEED_IDS.personPlanner,
          startTime: new Date(body.records[0]!.startTime),
          source: 'IMPORT',
        },
      }),
    ).toBe(1);
  });

  it('stores one export, audit, and outbox event for concurrent identical exports', async () => {
    const closing = await prisma.closingPeriod.create({
      data: {
        organizationUnitId: SEED_IDS.ouAdmin,
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-31T23:59:59.999Z'),
        status: 'CLOSED',
      },
    });

    const responses = await Promise.all([
      post(`/v1/closing-periods/${closing.id}/export`, TOKENS.hr, { format: 'CSV_V1' }),
      post(`/v1/closing-periods/${closing.id}/export`, TOKENS.hr, { format: 'CSV_V1' }),
    ]);

    expect(responses.some(({ status }) => status === 201)).toBe(true);
    expect(responses.every(({ status }) => status === 201 || status === 409)).toBe(true);
    const exportRun = await prisma.exportRun.findFirstOrThrow({
      where: { closingPeriodId: closing.id, format: 'CSV_V1' },
    });
    expect(
      await prisma.exportRun.count({
        where: { closingPeriodId: closing.id, format: 'CSV_V1' },
      }),
    ).toBe(1);
    expect(
      await prisma.auditEntry.count({
        where: { action: 'CLOSING_EXPORTED', entityId: exportRun.id },
      }),
    ).toBe(1);
    expect(
      await prisma.domainEventOutbox.count({
        where: { eventType: 'export.ready', aggregateId: exportRun.id },
      }),
    ).toBe(1);
  });

  it('serializes absence cancellation and approval without a database error', async () => {
    const created = await post('/v1/absences', TOKENS.employee, {
      personId: SEED_IDS.personEmployee,
      type: 'ANNUAL_LEAVE',
      startDate: '2026-05-25',
      endDate: '2026-05-26',
      note: 'Concurrent decision test',
    });
    expect(created.status).toBe(201);

    const workflow = await prisma.workflowInstance.findFirstOrThrow({
      where: { type: 'LEAVE_REQUEST', entityType: 'Absence', entityId: created.body.id },
    });
    const responses = await Promise.all([
      post(`/v1/absences/${created.body.id}/cancel`, TOKENS.employee, {}),
      post(`/v1/workflows/${workflow.id}/decision`, TOKENS.lead, {
        decision: 'APPROVED',
        reason: 'Concurrent approval test',
      }),
    ]);

    expect(responses.every(({ status }) => status < 500)).toBe(true);
    expect(await prisma.absence.findUnique({ where: { id: created.body.id } })).toMatchObject({
      status: 'CANCELLED',
    });
  });
});
