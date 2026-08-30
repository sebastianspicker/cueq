/** Extends the deterministic workforce baseline with synthetic terminal and HR-import demo data. */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { FIXED_SEED_TIMESTAMP, runSeedLayer, stableCuid } from './seed-helpers.mjs';

const prisma = new PrismaClient();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function runBaseline(command) {
  runSeedLayer(resolve(__dirname, 'seed-baseline.mjs'), command);
}

const IDs = {
  terminalDevice: stableCuid(999),
  terminalHeartbeat: stableCuid(1_000),
  hrImportRun: stableCuid(1_001),
  auditSeed: stableCuid(1_002),
};

/** Deletes demo additions before delegating to the destructive baseline reset. */
async function reset() {
  await prisma.terminalHeartbeat.deleteMany();
  await prisma.terminalDevice.deleteMany();
  await prisma.hrImportRun.deleteMany();
  runBaseline('reset');
}

/** Rebuilds the baseline dependency layer, then appends demo seed evidence. */
async function seed() {
  runBaseline('seed');

  const terminal = await prisma.terminalDevice.upsert({
    where: { terminalId: 'T-01' },
    create: {
      id: IDs.terminalDevice,
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
      id: IDs.terminalHeartbeat,
      terminalDeviceId: terminal.id,
      observedAt: new Date('2026-03-11T07:59:00.000Z'),
      bufferedRecords: 3,
      errorCount: 0,
      details: { mode: 'pilot', note: 'Synthetic heartbeat for pilot baseline' },
    },
  });

  await prisma.hrImportRun.create({
    data: {
      id: IDs.hrImportRun,
      source: 'FILE',
      sourceFile: 'demo-seed',
      status: 'SUCCEEDED',
      totalRows: 3,
      createdRows: 1,
      updatedRows: 2,
      skippedRows: 0,
      errorCount: 0,
      summary: {
        departments: ['Verwaltung', 'Pforte', 'IT Bereitschaft'],
        scenario: 'Demo integration seed baseline',
      },
      importedById: 'system:demo-seed',
    },
  });

  await prisma.auditEntry.createMany({
    data: [
      {
        id: IDs.auditSeed,
        actorId: 'system:demo-seed',
        action: 'DEMO_SEED_COMPLETED',
        entityType: 'SeedRun',
        entityId: 'demo-default',
        after: { seeded: true, seededAt: FIXED_SEED_TIMESTAMP.toISOString() },
        reason: 'Synthetic deterministic demo integration baseline',
        ipAddress: '127.0.0.1',
      },
    ],
    skipDuplicates: true,
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
    console.error('Demo seed script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
