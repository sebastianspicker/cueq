import { execSync } from 'node:child_process';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { buildMockToken, MOCK_IDENTITIES } from '../src/test-utils/seed-ids';
import { AppModule } from '../src/app.module';

export async function createTestApp(): Promise<INestApplication> {
  process.env.AUTH_MODE = 'mock';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

function seedData(script: 'db:seed:phase2' | 'db:seed:phase3') {
  const cwd = join(__dirname, '..', '..', '..');
  const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';

  execSync('pnpm --filter @cueq/database exec prisma db push --force-reset --skip-generate', {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });

  execSync(`pnpm --filter @cueq/database ${script}`, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
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
