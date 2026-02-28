#!/usr/bin/env node
import { prisma, Role } from '@cueq/database';

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) {
      continue;
    }

    const [key, inlineValue] = current.split('=', 2);
    if (inlineValue !== undefined) {
      args.set(key, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(key, next);
      index += 1;
      continue;
    }

    args.set(key, 'true');
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const year = Number(args.get('--year') ?? new Date().getUTCFullYear());
  const reason = args.get('--reason') ?? 'FR-400 initial leave-adjustment backfill';
  const createdBy = args.get('--created-by') ?? 'system:fr400-backfill';
  const dryRun = args.get('--dry-run') === 'true';

  if (!Number.isFinite(year) || year < 1970 || year > 2200) {
    throw new Error(`Invalid --year value: ${year}`);
  }

  const people = await prisma.person.findMany({
    where: {
      role: {
        in: [Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER],
      },
    },
    select: { id: true },
  });

  let created = 0;
  for (const person of people) {
    const existing = await prisma.leaveAdjustment.findFirst({
      where: {
        personId: person.id,
        year,
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    created += 1;
    if (dryRun) {
      continue;
    }

    await prisma.leaveAdjustment.create({
      data: {
        personId: person.id,
        year,
        deltaDays: 0,
        reason,
        createdBy,
      },
    });
  }

  const report = {
    year,
    dryRun,
    scanned: people.length,
    created,
  };
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error('Leave-adjustment backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
