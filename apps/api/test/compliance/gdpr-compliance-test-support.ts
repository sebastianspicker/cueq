import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { prisma } from '@cueq/database';
import { TOKENS } from '../test-helpers.js';

export function createGdprTestContext() {
  let app: INestApplication | undefined;

  function as(token: string) {
    const server = app!.getHttpServer();

    return {
      get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${token}`),
      post: (path: string) => request(server).post(path).set('Authorization', `Bearer ${token}`),
    };
  }

  function createAbsence(
    token: string,
    payload: {
      personId: string;
      type: string;
      startDate: string;
      endDate: string;
      note?: string;
      status?: string;
    },
  ) {
    return as(token).post('/v1/absences').send(payload);
  }

  function teamCalendar(token: string, start: string, end: string) {
    return as(token).get('/v1/calendar/team').query({ start, end });
  }

  function report(token: string, path: string, query: Record<string, string | string[]>) {
    return as(token).get(path).query(query);
  }

  async function approveFirstLeaveRequest() {
    const inbox = await as(TOKENS.lead).get('/v1/workflows/inbox');
    const leaveWorkflow = inbox.body.find(
      (entry: { type: string }) => entry.type === 'LEAVE_REQUEST',
    );
    if (leaveWorkflow) {
      await as(TOKENS.lead)
        .post(`/v1/workflows/${leaveWorkflow.id}/decision`)
        .send({ decision: 'APPROVED', reason: 'Approved' });
    }
  }

  async function reportAccessCount() {
    return prisma.auditEntry.count({
      where: { action: 'REPORT_ACCESSED' },
    });
  }

  return {
    get app() {
      return app;
    },
    set app(value: INestApplication | undefined) {
      app = value;
    },
    as,
    createAbsence,
    teamCalendar,
    report,
    approveFirstLeaveRequest,
    reportAccessCount,
  };
}

export type GdprTestContext = ReturnType<typeof createGdprTestContext>;
