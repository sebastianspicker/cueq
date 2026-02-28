import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runPhase2(command) {
  execSync(`node ${resolve(__dirname, 'seed-phase2.mjs')} ${command}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
    },
  });
}

async function reset() {
  runPhase2('reset');
  await prisma.terminalHeartbeat.deleteMany();
  await prisma.terminalDevice.deleteMany();
  await prisma.hrImportRun.deleteMany();
}

async function seed() {
  runPhase2('seed');

  const terminal = await prisma.terminalDevice.upsert({
    where: { terminalId: 'T-01' },
    create: {
      terminalId: 'T-01',
      name: 'Pforte Terminal 01',
      isActive: true,
      lastSeenAt: new Date('2026-03-11T07:59:00.000Z'),
      lastErrorCount: 0,
    },
    update: {
      name: 'Pforte Terminal 01',
      isActive: true,
      lastSeenAt: new Date('2026-03-11T07:59:00.000Z'),
      lastErrorCount: 0,
    },
  });

  await prisma.terminalHeartbeat.create({
    data: {
      terminalDeviceId: terminal.id,
      observedAt: new Date('2026-03-11T07:59:00.000Z'),
      bufferedRecords: 3,
      errorCount: 0,
      details: { mode: 'pilot', note: 'Synthetic heartbeat for pilot baseline' },
    },
  });

  await prisma.hrImportRun.create({
    data: {
      source: 'FILE',
      sourceFile: 'fixtures/integrations/hr-master-phase3.csv',
      status: 'SUCCEEDED',
      totalRows: 3,
      createdRows: 1,
      updatedRows: 2,
      skippedRows: 0,
      errorCount: 0,
      summary: {
        departments: ['Verwaltung', 'Pforte', 'IT Bereitschaft'],
        scenario: 'Phase 3 pilot seed baseline',
      },
      importedById: 'system:phase3-seed',
    },
  });

  await prisma.auditEntry.create({
    data: {
      actorId: 'system:phase3-seed',
      action: 'PHASE3_SEED_COMPLETED',
      entityType: 'SeedRun',
      entityId: 'phase3-default',
      after: { seeded: true, seededAt: new Date().toISOString() },
      reason: 'Synthetic deterministic phase-3 pilot baseline',
      ipAddress: '127.0.0.1',
    },
  });
}

async function main() {
  const command = process.argv[2] ?? 'seed';

  if (command === 'reset') {
    await reset();
    return;
  }

  if (command === 'seed') {
    await reset();
    await seed();
    return;
  }

  throw new Error(`Unsupported command: ${command}. Use \"seed\" or \"reset\".`);
}

main()
  .catch((error) => {
    console.error('Phase 3 seed script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
