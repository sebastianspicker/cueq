import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { buildMockToken, cuidFor, SEED_IDS } from '../../src/test-utils/seed-ids';
import { PrismaService } from '../../src/persistence/prisma.service';
import { createTestApp, seedPhase2Data, TOKENS } from '../test-helpers';

describe('FR-100 integration', () => {
  let app: INestApplication;

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

  it('returns onboarding metadata on dashboard summary', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/dashboard/me')
      .set('Authorization', `Bearer ${TOKENS.employee}`)
      .send();

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('todayBookingsCount');
    expect(response.body).toHaveProperty('clockInTimeTypeId');
    expect(response.body).toHaveProperty('showOrientation');
    expect(response.body).toHaveProperty('hasFirstBooking');
  });

  it('shows orientation for first-login user without bookings', async () => {
    const prisma = app.get(PrismaService);
    const seededEmployee = await prisma.person.findUnique({
      where: { id: SEED_IDS.personEmployee },
      select: {
        organizationUnitId: true,
        workTimeModelId: true,
      },
    });
    if (!seededEmployee) {
      throw new Error('Expected seeded employee');
    }

    const personId = cuidFor(1234);
    await prisma.person.create({
      data: {
        id: personId,
        externalId: 'onboarding-new-user',
        firstName: 'Nina',
        lastName: 'Neu',
        email: 'nina.neu@cueq.local',
        role: 'EMPLOYEE',
        organizationUnitId: seededEmployee.organizationUnitId,
        workTimeModelId: seededEmployee.workTimeModelId,
      },
    });

    const token = buildMockToken({
      sub: personId,
      email: 'nina.neu@cueq.local',
      role: 'EMPLOYEE',
      organizationUnitId: seededEmployee.organizationUnitId,
    });

    const response = await request(app.getHttpServer())
      .get('/v1/dashboard/me')
      .set('Authorization', `Bearer ${token}`)
      .send();

    expect(response.status).toBe(200);
    expect(response.body.hasFirstBooking).toBe(false);
    expect(response.body.showOrientation).toBe(true);
    expect(response.body.clockInTimeTypeId).toBeTruthy();
  });
});
