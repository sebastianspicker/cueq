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

export function seedPhase2Data() {
  const cwd = join(__dirname, '..', '..', '..');
  execSync('pnpm --filter @cueq/database db:seed:phase2', {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
    },
  });
}

export const TOKENS = {
  employee: buildMockToken(MOCK_IDENTITIES.employee),
  lead: buildMockToken(MOCK_IDENTITIES.lead),
  planner: buildMockToken(MOCK_IDENTITIES.planner),
  hr: buildMockToken(MOCK_IDENTITIES.hr),
  admin: buildMockToken(MOCK_IDENTITIES.admin),
};
