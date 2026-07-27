import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpAdapterHost } from '@nestjs/core';
import { buildMockToken, MOCK_IDENTITIES } from '../src/test-utils/seed-ids.js';
import { AppModule } from '../src/app.module.js';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter.js';
import { ZodExceptionFilter } from '../src/common/filters/zod-exception.filter.js';
import {
  HR_MASTER_PROVIDER,
  type HrMasterProviderPort,
} from '../src/phase2/hr-master-provider.port.js';
import { DEFAULT_DATABASE_URL, prismaPushReset, runDatabaseScript } from './setup/db-utils.js';

interface TestAppOptions {
  hrMasterProvider?: HrMasterProviderPort;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  process.env.AUTH_MODE = 'mock';
  process.env.WEBHOOK_SECRET_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  if (options.hrMasterProvider) {
    moduleBuilder.overrideProvider(HR_MASTER_PROVIDER).useValue(options.hrMasterProvider);
  }

  const moduleRef = await moduleBuilder.compile();

  const app = moduleRef.createNestApplication();
  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new PrismaExceptionFilter(), new ZodExceptionFilter(httpAdapterHost));
  await app.init();
  return app;
}

function seedData(script: 'db:seed:phase2' | 'db:seed:phase3') {
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

  prismaPushReset(databaseUrl);
  runDatabaseScript(script, databaseUrl);
}

export function seedPhase2Data() {
  seedData('db:seed:phase2');
}

export function seedPhase3Data() {
  seedData('db:seed:phase3');
}

export const TOKENS = {
  employee: buildMockToken(MOCK_IDENTITIES.employee),
  lead: buildMockToken(MOCK_IDENTITIES.lead),
  planner: buildMockToken(MOCK_IDENTITIES.planner),
  hr: buildMockToken(MOCK_IDENTITIES.hr),
  admin: buildMockToken(MOCK_IDENTITIES.admin),
  payroll: buildMockToken(MOCK_IDENTITIES.payroll),
  dataProtection: buildMockToken(MOCK_IDENTITIES.dataProtection),
  worksCouncil: buildMockToken(MOCK_IDENTITIES.worksCouncil),
};
