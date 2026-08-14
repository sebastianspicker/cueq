import { BadGatewayException } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, seedPhase2Data } from '../test-helpers.js';
import { PrismaService } from '../../src/persistence/prisma.service.js';
import type { HrMasterProviderPort } from '../../src/phase2/hr-master-provider.port.js';

const HR_IMPORT_TOKEN = process.env.HR_IMPORT_TOKEN ?? 'dev-hr-token';

describe('Phase 3 integration: HR import', () => {
  let app: INestApplication;
  let hrProviderMode: 'success' | 'invalid-payload' = 'success';

  const hrProvider: HrMasterProviderPort = {
    async fetchMasterRecords() {
      if (hrProviderMode === 'invalid-payload') {
        throw new BadGatewayException('HR master API returned an invalid payload schema.');
      }

      return [
        {
          externalId: 'hrapi100',
          firstName: 'Api',
          lastName: 'Import',
          email: 'api.import@cueq.local',
          role: 'EMPLOYEE',
          organizationUnit: 'Verwaltung',
          workTimeModel: 'Gleitzeit Vollzeit',
          weeklyHours: '39.83',
          dailyTargetHours: '7.97',
          supervisorExternalId: 'lead01',
        },
      ];
    },
  };

  beforeAll(async () => {
    seedPhase2Data();
    app = await createTestApp({ hrMasterProvider: hrProvider });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
  it('runs file-based HR import and fetches import run', async () => {
    const csv = [
      'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
      'hrimp100,Ina,Import,ina.import@cueq.local,EMPLOYEE,"Verwaltung, Campus Nord",Gleitzeit Vollzeit,39.83,7.97,lead01',
    ].join('\n');

    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        sourceFile: 'hr-master-phase3.csv',
        csv,
      });

    expect(run.status).toBe(201);
    expect(run.body.status).toBe('SUCCEEDED');
    expect(run.body.totalRows).toBe(1);

    const prisma = app.get(PrismaService);
    const importedPerson = await prisma.person.findFirst({
      where: { externalId: 'hrimp100' },
      include: { organizationUnit: true },
    });
    expect(importedPerson?.organizationUnit?.name).toBe('Verwaltung, Campus Nord');

    const getRun = await request(app.getHttpServer())
      .get(`/v1/hr/import-runs/${run.body.id}`)
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send();

    expect(getRun.status).toBe(200);
    expect(getRun.body.id).toBe(run.body.id);
  });

  it('fails HR import when externalId and email match different existing people', async () => {
    const prisma = app.get(PrismaService);
    const employeeBefore = await prisma.person.findUniqueOrThrow({
      where: { externalId: 'employee01' },
    });
    const leadBefore = await prisma.person.findUniqueOrThrow({
      where: { email: 'lead@cueq.local' },
    });
    const csv = [
      'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
      'employee01,Cross,Merge,lead@cueq.local,EMPLOYEE,Verwaltung,Gleitzeit Vollzeit,39.83,7.97',
    ].join('\n');

    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        sourceFile: 'hr-master-cross-identifier.csv',
        csv,
      });

    expect(run.status).toBe(422);
    expect(run.body.status).toBe('FAILED');
    expect(run.body.errorCount).toBe(1);
    expect(run.body.summary.errors[0]).toContain('HR identity conflict');

    const employeeAfter = await prisma.person.findUniqueOrThrow({
      where: { id: employeeBefore.id },
    });
    const leadAfter = await prisma.person.findUniqueOrThrow({
      where: { id: leadBefore.id },
    });

    expect(employeeAfter.externalId).toBe(employeeBefore.externalId);
    expect(employeeAfter.email).toBe(employeeBefore.email);
    expect(employeeAfter.firstName).toBe(employeeBefore.firstName);
    expect(leadAfter.externalId).toBe(leadBefore.externalId);
    expect(leadAfter.email).toBe(leadBefore.email);
    expect(leadAfter.firstName).toBe(leadBefore.firstName);
  });

  it('returns non-2xx for HR import row validation failures', async () => {
    const csv = [
      'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours',
      'hrbadrole100,Bad,Role,bad.role@cueq.local,UNKNOWN_ROLE,Verwaltung,Gleitzeit Vollzeit,39.83,7.97',
    ].join('\n');

    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        sourceFile: 'hr-master-bad-role.csv',
        csv,
      });

    expect(run.status).toBe(400);
    expect(run.body.code).toBe('HR_IMPORT_VALIDATION_FAILED');
    expect(run.body.message).toBe('HR import payload validation failed.');
    expect(run.body.errors[0]).toContain('Unsupported HR role');
  });

  it('returns non-2xx for HR import supervisor resolution failures', async () => {
    const prisma = app.get(PrismaService);
    const csv = [
      'externalId,firstName,lastName,email,role,organizationUnit,workTimeModel,weeklyHours,dailyTargetHours,supervisorExternalId',
      'hrmissingsupervisor100,Missing,Supervisor,missing.supervisor@cueq.local,EMPLOYEE,Verwaltung,Gleitzeit Vollzeit,39.83,7.97,does-not-exist',
    ].join('\n');

    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        sourceFile: 'hr-master-missing-supervisor.csv',
        csv,
      });

    expect(run.status).toBe(422);
    expect(run.body.status).toBe('FAILED');
    expect(run.body.errorCount).toBe(1);
    expect(run.body.summary.errors[0]).toContain('Supervisor externalId not found');

    const importedPerson = await prisma.person.findFirst({
      where: { externalId: 'hrmissingsupervisor100' },
    });
    expect(importedPerson).toBeNull();
  });

  it('rejects oversized HR import CSV payloads', async () => {
    const oversizedCsv = 'x'.repeat(2_000_001);

    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        sourceFile: 'oversized-hr.csv',
        csv: oversizedCsv,
      });

    expect(run.status).toBe(413);
  });

  it('runs API-source HR import via provider contract', async () => {
    hrProviderMode = 'success';
    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        source: 'API',
        sourceFile: 'hr-master-http-v1',
      });

    expect(run.status).toBe(201);
    expect(run.body.status).toBe('SUCCEEDED');
    expect(run.body.totalRows).toBe(1);
    expect(run.body.createdRows).toBe(1);
  });

  it('fails API-source import when upstream payload is invalid', async () => {
    hrProviderMode = 'invalid-payload';
    const run = await request(app.getHttpServer())
      .post('/v1/hr/import-runs')
      .set('x-integration-token', HR_IMPORT_TOKEN)
      .send({
        source: 'API',
      });

    expect(run.status).toBe(502);
  });
});
