import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { createFr500TestSupport, SEED_IDS, TOKENS } from './fr500-test-support.js';
import { WorkflowRuntimeService } from '../../src/phase2/workflow-runtime.service.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

describe('FR-500 integration', () => {
  let app: INestApplication;
  const { tokenForPerson } = createFr500TestSupport(() => app);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedPhase2Data();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('supports overtime approval workflow and updates overtime hours on approval', async () => {
    const prisma = app.get(PrismaService);
    const baseline = await prisma.timeAccount.findFirst({
      where: { personId: SEED_IDS.personEmployee },
      orderBy: { periodStart: 'desc' },
    });
    if (!baseline) {
      throw new Error('Expected seeded time account');
    }

    const created = await request(app.getHttpServer())
      .post('/v1/workflows/overtime-approvals')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        periodStart: baseline.periodStart.toISOString(),
        periodEnd: baseline.periodEnd.toISOString(),
        overtimeHours: 1.5,
        reason: 'Requesting overtime approval for month-end support.',
      });
    expect(created.status).toBe(201);
    expect(created.body.type).toBe('OVERTIME_APPROVAL');

    const approval = await request(app.getHttpServer())
      .post(`/v1/workflows/${created.body.id}/decision`)
      .set('Authorization', `Bearer ${tokenForPerson(created.body.approverId)}`)
      .send({
        action: 'APPROVE',
        reason: 'Approved overtime',
      });
    expect(approval.status).toBe(201);

    const updated = await prisma.timeAccount.findUnique({
      where: { id: baseline.id },
    });
    expect(Number(updated?.overtimeHours ?? 0)).toBe(
      Number(Number(baseline.overtimeHours).toFixed(2)) + 1.5,
    );
  });

  it('rejects overtime approval workflow when no matching time account exists', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/overtime-approvals')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        personId: SEED_IDS.personEmployee,
        periodStart: '2030-01-01T00:00:00.000Z',
        periodEnd: '2030-01-31T23:59:59.000Z',
        overtimeHours: 2,
        reason: 'Request should fail without a matching account period.',
      });

    expect(created.status).toBe(400);
    expect(String(created.body.message)).toContain('No matching time account');
  });

  it('escalates overdue workflows exactly once per overdue instance', async () => {
    const created = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        bookingId: SEED_IDS.bookingEmployeeIn,
        reason: 'Escalation idempotency test',
      });
    expect(created.status).toBe(201);

    const prisma = app.get(PrismaService);
    await prisma.workflowInstance.update({
      where: { id: created.body.id },
      data: {
        status: 'PENDING',
        dueAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const runtime = app.get(WorkflowRuntimeService);
    const first = await runtime.escalateOverdueWorkflows(new Date('2026-12-31T00:00:00.000Z'));
    const second = await runtime.escalateOverdueWorkflows(new Date('2026-12-31T00:00:00.000Z'));

    expect(first.escalated).toBeGreaterThan(0);
    expect(second.escalated).toBe(0);

    const escalated = await prisma.workflowInstance.findUnique({
      where: { id: created.body.id },
    });
    expect(escalated?.status).toBe('ESCALATED');
    expect(escalated?.escalationLevel).toBe(1);
    expect(escalated?.escalatedAt).not.toBeNull();
  });
});
