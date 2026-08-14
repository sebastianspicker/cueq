import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { createFr500TestSupport, SEED_IDS, TOKENS } from './fr500-test-support.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

describe('FR-500 integration', () => {
  let app: INestApplication;
  const { as } = createFr500TestSupport(() => app);

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

  it('supports workflow policy list and upsert for HR', async () => {
    const list = await as(TOKENS.hr).get('/v1/workflows/policies');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(list.body.some((entry: { type: string }) => entry.type === 'LEAVE_REQUEST')).toBe(true);

    const updated = await as(TOKENS.hr)
      .put('/v1/workflows/policies/BOOKING_CORRECTION')
      .send({
        escalationDeadlineHours: 12,
        escalationRoles: ['HR', 'ADMIN'],
        maxDelegationDepth: 4,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.escalationDeadlineHours).toBe(12);
    expect(updated.body.maxDelegationDepth).toBe(4);

    const prisma = app.get(PrismaService);
    const audit = await prisma.auditEntry.findFirst({
      where: {
        action: 'WORKFLOW_POLICY_UPDATED',
        entityType: 'WorkflowPolicy',
        entityId: updated.body.id,
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects workflow policy escalation roles that are invalid for the workflow type', async () => {
    const invalid = await as(TOKENS.hr)
      .put('/v1/workflows/policies/LEAVE_REQUEST')
      .send({
        escalationDeadlineHours: 12,
        escalationRoles: ['SHIFT_PLANNER'],
        maxDelegationDepth: 4,
      });
    expect(invalid.status).toBe(400);
    expect(String(invalid.body.message)).toContain('cannot be used for workflow type');
  });

  it('supports workflow delegation CRUD for HR', async () => {
    const created = await as(TOKENS.hr).post('/v1/workflows/delegations').send({
      delegatorId: SEED_IDS.personLead,
      delegateId: SEED_IDS.personHr,
      workflowType: 'LEAVE_REQUEST',
      organizationUnitId: SEED_IDS.ouAdmin,
      activeFrom: '2026-01-01T00:00:00.000Z',
      priority: 2,
    });
    expect(created.status).toBe(201);
    expect(created.body.delegatorId).toBe(SEED_IDS.personLead);

    const listed = await as(TOKENS.hr)
      .get('/v1/workflows/delegations')
      .query({ delegatorId: SEED_IDS.personLead, workflowType: 'LEAVE_REQUEST' });
    expect(listed.status).toBe(200);
    expect(listed.body.some((entry: { id: string }) => entry.id === created.body.id)).toBe(true);

    const patched = await as(TOKENS.hr)
      .patch(`/v1/workflows/delegations/${created.body.id}`)
      .send({ priority: 9, isActive: false });
    expect(patched.status).toBe(200);
    expect(patched.body.priority).toBe(9);
    expect(patched.body.isActive).toBe(false);

    const removed = await as(TOKENS.hr).delete(`/v1/workflows/delegations/${created.body.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.deleted).toBe(true);
  });
});
