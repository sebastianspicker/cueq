/** Runs the deterministic synthetic workforce baseline seed lifecycle. */
import { PrismaClient } from '@prisma/client';
import { stableCuid } from './seed-helpers.mjs';
import { seedFoundation } from './seed-baseline/foundation.mjs';
import { resetBaseline } from './seed-baseline/reset.mjs';
import { seedTimeOperations } from './seed-baseline/time-operations.mjs';
import { seedWorkflowClosing } from './seed-baseline/workflow-closing.mjs';

const prisma = new PrismaClient();

function cuidFor(index) {
  return stableCuid(index);
}

const IDs = {
  ouAdmin: cuidFor(1),
  ouSecurity: cuidFor(2),
  ouIt: cuidFor(3),
  modelFlextime: cuidFor(10),
  modelShift: cuidFor(11),
  modelOncall: cuidFor(12),
  personEmployee: cuidFor(100),
  personLead: cuidFor(101),
  personPlanner: cuidFor(102),
  personHr: cuidFor(103),
  personAdmin: cuidFor(104),
  personItOncall: cuidFor(105),
  personPayroll: cuidFor(106),
  personDataProtection: cuidFor(107),
  personWorksCouncil: cuidFor(108),
  timeTypeWork: cuidFor(200),
  timeTypePause: cuidFor(201),
  timeTypeOnCall: cuidFor(202),
  timeTypeDeployment: cuidFor(203),
  rosterCurrent: cuidFor(300),
  shiftNight: cuidFor(301),
  bookingEmployeeIn: cuidFor(400),
  bookingEmployeeOut: cuidFor(401),
  bookingOncallDeployment: cuidFor(402),
  absenceAnnual: cuidFor(500),
  absenceSick: cuidFor(501),
  workflowCorrection: cuidFor(600),
  workflowPolicyLeave: cuidFor(610),
  workflowPolicyCorrection: cuidFor(611),
  workflowPolicyPostClose: cuidFor(612),
  delegationLeadToHr: cuidFor(620),
  closingPeriod: cuidFor(700),
  exportRun: cuidFor(701),
  timeAccountEmployee: cuidFor(800),
  onCallDeployment: cuidFor(900),
  onCallRotation: cuidFor(901),
  auditSeed: cuidFor(950),
};

/** Creates the complete workforce baseline after reset; fixed identifiers make repeated runs reproducible. */
async function seed() {
  await seedFoundation(prisma, IDs);
  await seedTimeOperations(prisma, IDs);
  await seedWorkflowClosing(prisma, IDs);
}

async function main() {
  const command = process.argv[2] ?? 'seed';

  if (command === 'reset') {
    await resetBaseline(prisma);
    return;
  }

  if (command === 'seed') {
    await resetBaseline(prisma);
    await seed();
    return;
  }

  throw new Error(`Unsupported command: ${command}. Use "seed" or "reset".`);
}

/** Executes the seed command and always disconnects the Prisma client. */
export function runSeedBaseline() {
  main()
    .catch((error) => {
      console.error('Baseline seed script failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
