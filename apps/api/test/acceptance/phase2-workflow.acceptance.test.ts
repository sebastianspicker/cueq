import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

describe('Phase 3 acceptance scenarios (AT-01..AT-08)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(() => {
    seedPhase2Data();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('AT-02 correction delegation and inbox flow', async () => {
    const createCorrection = await request(app.getHttpServer())
      .post('/v1/workflows/booking-corrections')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send({
        bookingId: 'c000000000000000000000400',
        reason: 'Bitte um Korrektur der Startzeit nach Terminalausfall',
      });

    expect(createCorrection.status).toBe(201);
    expect(createCorrection.body.status).toBe('PENDING');
    expect(createCorrection.body).toHaveProperty('dueAt');

    const initialApproverId = createCorrection.body.approverId as string | null;
    expect(initialApproverId).toBeTruthy();

    const initialApproverToken =
      initialApproverId === SEED_IDS.personLead
        ? TOKENS.lead
        : initialApproverId === SEED_IDS.personHr
          ? TOKENS.hr
          : TOKENS.admin;

    const initialInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .query({ type: 'BOOKING_CORRECTION' })
      .set('Authorization', `Bearer ${initialApproverToken}`);

    expect(initialInbox.status).toBe(200);
    const workflow = initialInbox.body.find(
      (entry: { id: string }) => entry.id === createCorrection.body.id,
    );
    expect(workflow).toBeDefined();
    expect(workflow?.availableActions).toContain('DELEGATE');

    const delegateToId =
      initialApproverId === SEED_IDS.personLead ? SEED_IDS.personHr : SEED_IDS.personLead;
    const delegatedInboxToken = delegateToId === SEED_IDS.personLead ? TOKENS.lead : TOKENS.hr;

    const delegated = await request(app.getHttpServer())
      .post(`/v1/workflows/${createCorrection.body.id}/decision`)
      .set('Authorization', `Bearer ${initialApproverToken}`)
      .send({
        action: 'DELEGATE',
        delegateToId,
        reason: 'Delegate for approval continuity',
      });

    expect(delegated.status).toBe(201);
    expect(delegated.body.approverId).toBe(delegateToId);

    const delegatedInbox = await request(app.getHttpServer())
      .get('/v1/workflows/inbox')
      .query({ type: 'BOOKING_CORRECTION' })
      .set('Authorization', `Bearer ${delegatedInboxToken}`);
    const delegatedWorkflow = delegatedInbox.body.find(
      (entry: { id: string }) => entry.id === createCorrection.body.id,
    );
    expect(delegatedWorkflow).toBeDefined();
    expect(delegatedWorkflow?.isOverdue).toBe(false);
  });
});
