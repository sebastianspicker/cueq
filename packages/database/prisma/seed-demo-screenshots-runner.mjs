/** Builds the synthetic, deterministic mock-university dataset used to capture product screenshots locally. */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { seedDemoClosing } from './demo-seed/closing.mjs';
import { IDs, MARCH_PERIOD_END, MARCH_PERIOD_START } from './demo-seed/ids.mjs';
import { seedDemoPeople, seedDemoSecurityPeople } from './demo-seed/people.mjs';
import { seedDemoScheduling } from './demo-seed/scheduling.mjs';
import { runSeedLayer } from './seed-helpers.mjs';

const DEFAULT_DATABASE_URL =
  'postgresql://cueq:cueq_dev_password@localhost:5433/cueq?schema=public';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runPhase3(command) {
  runSeedLayer(resolve(__dirname, 'seed-phase3.mjs'), command);
}

/** Applies screenshot-specific fixtures after the Phase 3 baseline; stable IDs and upserts keep reruns reproducible. */
async function seed() {
  runPhase3('seed');
  await seedDemoPeople(prisma, IDs);
  await seedDemoSecurityPeople(prisma, IDs);
  await seedDemoScheduling(prisma, IDs);
  await seedDemoClosing(prisma, IDs, MARCH_PERIOD_START, MARCH_PERIOD_END);
}

/** Delegates cleanup to the Phase 3 reset, which also clears the lower seed layers. */
function reset() {
  runPhase3('reset');
}

async function main() {
  const command = process.argv[2] ?? 'seed';

  if (command === 'reset') {
    reset();
    return;
  }

  if (command === 'seed') {
    await seed();
    return;
  }

  throw new Error(`Unsupported command: ${command}. Use "seed" or "reset".`);
}

main()
  .catch((error) => {
    console.error('Demo screenshot seed script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
