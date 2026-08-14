import request from 'supertest';
import type { Response, Test } from 'supertest';
import { expect } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';

export { SEED_IDS, TOKENS };

export interface WorkflowEntry {
  id: string;
  type: string;
  entityId: string;
  approverId?: string;
  availableActions?: string[];
}

interface Fr500RequestClient {
  delete(path: string): Test;
  get(path: string): Test;
  patch(path: string): Test;
  post(path: string): Test;
  put(path: string): Test;
}

interface Fr500TestSupport {
  as(token: string): Fr500RequestClient;
  createBookingCorrection(
    reason: string,
    token?: string,
    correction?: Record<string, unknown>,
  ): Test;
  createPlannerRosterShift(params: {
    periodStart: string;
    periodEnd: string;
    shiftStart: string;
    shiftEnd: string;
  }): Promise<{ assignment: Response; roster: Response; shift: Response }>;
  decideWorkflow(workflowId: string, token: string, payload: Record<string, unknown>): Test;
  getInboxWorkflow(
    token: string,
    match: (workflow: WorkflowEntry) => boolean,
    query?: { type: string },
  ): Promise<WorkflowEntry>;
  tokenForPerson(personId: string | null | undefined): string;
  upsertSwapTarget(params: {
    id: string;
    externalId: string;
    firstName?: string;
    lastName: string;
    email: string;
  }): Promise<void>;
}

export function createFr500TestSupport(getApp: () => INestApplication): Fr500TestSupport {
  function as(token: string) {
    const server = getApp().getHttpServer();

    return {
      delete: (path: string) =>
        request(server).delete(path).set('Authorization', `Bearer ${token}`),
      get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${token}`),
      patch: (path: string) => request(server).patch(path).set('Authorization', `Bearer ${token}`),
      post: (path: string) => request(server).post(path).set('Authorization', `Bearer ${token}`),
      put: (path: string) => request(server).put(path).set('Authorization', `Bearer ${token}`),
    };
  }

  async function getInboxWorkflow(
    token: string,
    match: (workflow: WorkflowEntry) => boolean,
    query?: { type: string },
  ) {
    const inboxRequest = as(token).get('/v1/workflows/inbox');
    const inbox = query ? await inboxRequest.query(query) : await inboxRequest;
    expect(inbox.status).toBe(200);

    const workflow = inbox.body.find((entry: WorkflowEntry) => match(entry));
    expect(workflow).toBeDefined();
    if (!workflow) {
      throw new Error('Expected workflow in inbox');
    }
    return workflow;
  }

  function decideWorkflow(workflowId: string, token: string, payload: Record<string, unknown>) {
    return as(token).post(`/v1/workflows/${workflowId}/decision`).send(payload);
  }

  function createBookingCorrection(
    reason: string,
    token = TOKENS.employee,
    correction: Record<string, unknown> = {},
  ) {
    return as(token)
      .post('/v1/workflows/booking-corrections')
      .send({
        bookingId: SEED_IDS.bookingEmployeeIn,
        reason,
        ...correction,
      });
  }

  async function createPlannerRosterShift(params: {
    periodStart: string;
    periodEnd: string;
    shiftStart: string;
    shiftEnd: string;
  }) {
    const roster = await as(TOKENS.planner).post('/v1/rosters').send({
      organizationUnitId: SEED_IDS.ouSecurity,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
    });
    expect(roster.status).toBe(201);

    const shift = await as(TOKENS.planner).post(`/v1/rosters/${roster.body.id}/shifts`).send({
      startTime: params.shiftStart,
      endTime: params.shiftEnd,
      shiftType: 'DAY',
      minStaffing: 1,
    });
    expect(shift.status).toBe(201);

    const assignment = await as(TOKENS.planner)
      .post(`/v1/rosters/${roster.body.id}/shifts/${shift.body.id}/assignments`)
      .send({ personId: SEED_IDS.personPlanner });
    expect(assignment.status).toBe(201);

    return { assignment, roster, shift };
  }

  async function upsertSwapTarget(params: {
    id: string;
    externalId: string;
    firstName?: string;
    lastName: string;
    email: string;
  }) {
    const prisma = getApp().get(PrismaService);
    const planner = await prisma.person.findUnique({
      where: { id: SEED_IDS.personPlanner },
      select: { workTimeModelId: true },
    });
    if (!planner) {
      throw new Error('Expected seeded planner user');
    }

    await prisma.person.upsert({
      where: { id: params.id },
      create: {
        id: params.id,
        externalId: params.externalId,
        firstName: params.firstName ?? 'Swap',
        lastName: params.lastName,
        email: params.email,
        role: 'EMPLOYEE',
        organizationUnitId: SEED_IDS.ouSecurity,
        workTimeModelId: planner.workTimeModelId,
      },
      update: {
        organizationUnitId: SEED_IDS.ouSecurity,
        workTimeModelId: planner.workTimeModelId,
      },
    });
  }

  function tokenForPerson(personId: string | null | undefined) {
    if (personId === SEED_IDS.personLead) {
      return TOKENS.lead;
    }
    if (personId === SEED_IDS.personHr) {
      return TOKENS.hr;
    }
    if (personId === SEED_IDS.personAdmin) {
      return TOKENS.admin;
    }
    if (personId === SEED_IDS.personPlanner) {
      return TOKENS.planner;
    }
    return TOKENS.hr;
  }

  return {
    as,
    createBookingCorrection,
    createPlannerRosterShift,
    decideWorkflow,
    getInboxWorkflow,
    tokenForPerson,
    upsertSwapTarget,
  };
}
