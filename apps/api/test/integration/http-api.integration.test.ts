import { WebhookJobWorker } from '../../src/modules/integrations/webhook-job-worker.service.js';
import { BookingPageSchema, WorkflowInboxItemPageSchema } from '@cueq/contracts';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';

const EMPLOYEE_ID = 'c000000000000000000000100';
const HR_ID = 'c000000000000000000000103';

let app: INestApplication | undefined;
let baseUrl = '';

async function get(path: string, token?: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'API integration tests require DATABASE_URL for a migrated disposable PostgreSQL database.',
    );
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WebhookJobWorker)
    .useValue({ poll: async () => undefined })
    .compile();
  app = moduleRef.createNestApplication();
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
});

describe('HTTP API integration', () => {
  it('serves public liveness over the real HTTP listener', async () => {
    const response = await get('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      version: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('reads a synthetic baseline dashboard and booking list for the authenticated employee', async () => {
    const [dashboardResponse, bookingsResponse] = await Promise.all([
      get('/v1/dashboard/me', 'employee-token'),
      get('/v1/bookings/me', 'employee-token'),
    ]);

    expect(dashboardResponse.status).toBe(200);
    await expect(dashboardResponse.json()).resolves.toMatchObject({
      personId: EMPLOYEE_ID,
      quickActions: ['CLOCK_IN', 'REQUEST_LEAVE'],
      hasFirstBooking: expect.any(Boolean),
      todayBookingsCount: expect.any(Number),
    });

    expect(bookingsResponse.status).toBe(200);
    const bookings = BookingPageSchema.parse(await bookingsResponse.json());
    expect(bookings.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personId: EMPLOYEE_ID, timeTypeCode: expect.any(String) }),
      ]),
    );
    expect(bookings.items.length).toBeLessThanOrEqual(50);
    expect(bookings).toHaveProperty('nextCursor');
  });

  it('accepts the overdue filter across HTTP validation and service parsing', async () => {
    const response = await get('/v1/workflows/inbox?overdueOnly=true&limit=1', 'employee-token');
    expect(response.status).toBe(200);
    const page = WorkflowInboxItemPageSchema.parse(await response.json());
    expect(page.items.length).toBeLessThanOrEqual(1);
    expect(page.items.every((item) => item.isOverdue)).toBe(true);
  });

  it('keeps the personnel directory closed to an authenticated employee', async () => {
    const response = await get(`/v1/persons/${HR_ID}`, 'employee-token');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      statusCode: 403,
    });
  });
});
