import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';

describe('Phase 2 integration: auth and identity', () => {
  let app: INestApplication;

  beforeAll(async () => {
    seedPhase2Data();
    app = await createTestApp();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('rejects unauthenticated access to /v1/me', async () => {
    const response = await request(app.getHttpServer()).get('/v1/me');
    expect(response.status).toBe(401);
  });

  it('returns authenticated identity for mock token', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`);

    expect(response.status).toBe(200);
    expect(response.body.role).toBe('EMPLOYEE');
    expect(response.body.email).toBe('employee@cueq.local');
  });
});
