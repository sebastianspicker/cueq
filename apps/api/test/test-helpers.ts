import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HttpAdapterHost } from '@nestjs/core';
import { buildMockToken, MOCK_IDENTITIES } from '../src/test-utils/seed-ids';
import { AppModule } from '../src/app.module';
import { ZodExceptionFilter } from '../src/common/filters/zod-exception.filter';
import {
  HR_MASTER_PROVIDER,
  type HrMasterProviderPort,
} from '../src/phase2/hr-master-provider.port';
import { DEFAULT_DATABASE_URL, prismaPushReset, runDatabaseScript } from './setup/db-utils';

interface TestAppOptions {
  hrMasterProvider?: HrMasterProviderPort;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  process.env.AUTH_MODE = 'mock';
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
  app.useGlobalFilters(new ZodExceptionFilter(httpAdapterHost));
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
