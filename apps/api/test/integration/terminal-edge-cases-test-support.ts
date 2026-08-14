import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { TOKENS } from '../test-helpers.js';
import { SEED_IDS } from '../../src/test-utils/seed-ids.js';

const TERMINAL_TOKEN = process.env.TERMINAL_GATEWAY_TOKEN ?? 'dev-terminal-token';

export interface TerminalRecord {
  personId: string;
  timeTypeCode: string;
  startTime: string;
  endTime: string;
}

export interface TerminalBatchPayload {
  terminalId: string;
  sourceFile: string;
  records: TerminalRecord[];
}

export function createTerminalEdgeCaseTestSupport(getApp: () => INestApplication) {
  function as(token: string) {
    const server = getApp().getHttpServer();

    return {
      get: (path: string) => request(server).get(path).set('Authorization', `Bearer ${token}`),
      post: (path: string) => request(server).post(path).set('Authorization', `Bearer ${token}`),
    };
  }

  function syncBatch(payload: TerminalBatchPayload, token = TOKENS.hr) {
    return as(token).post('/v1/terminal/sync/batches').send(payload);
  }

  function workRecord(startTime: string, endTime: string, personId = SEED_IDS.personPlanner) {
    return {
      personId,
      timeTypeCode: 'WORK',
      startTime,
      endTime,
    };
  }

  function syncHoneywellCsv(params: {
    terminalId: string;
    sourceFile: string;
    csv: string;
    token?: string;
  }) {
    return as(params.token ?? TOKENS.hr)
      .post('/v1/terminal/sync/batches/file')
      .send({
        terminalId: params.terminalId,
        sourceFile: params.sourceFile,
        protocol: 'HONEYWELL_CSV_V1',
        csv: params.csv,
      });
  }

  function postHeartbeat(payload: {
    terminalId: string;
    observedAt: string;
    bufferedRecords: number;
    errorCount: number;
  }) {
    return request(getApp().getHttpServer())
      .post('/v1/terminal/heartbeats')
      .set('x-integration-token', TERMINAL_TOKEN)
      .send(payload);
  }

  function getTerminalHealth() {
    return request(getApp().getHttpServer())
      .get('/v1/terminal/health')
      .set('x-integration-token', TERMINAL_TOKEN);
  }

  async function approveFirstLeaveRequest() {
    const inbox = await as(TOKENS.lead).get('/v1/workflows/inbox');
    const leaveWorkflow = inbox.body.find(
      (entry: { type: string }) => entry.type === 'LEAVE_REQUEST',
    );
    if (leaveWorkflow) {
      await as(TOKENS.lead)
        .post(`/v1/workflows/${leaveWorkflow.id}/decision`)
        .send({ decision: 'APPROVED', reason: 'Test' });
    }
  }

  return {
    as,
    syncBatch,
    workRecord,
    syncHoneywellCsv,
    postHeartbeat,
    getTerminalHealth,
    approveFirstLeaveRequest,
  };
}
