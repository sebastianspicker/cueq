#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import database from '../packages/database/dist/index.js';
import { parseArgsMap } from './lib/parse-args.mjs';
import { backfillPersonYear } from './lib/leave-adjustment-backfill.mjs';
export { backfillPersonYear, ZERO_DELTA_MARKER } from './lib/leave-adjustment-backfill.mjs';

const { prisma, Role } = database;

export async function runLeaveAdjustmentBackfill(db, input) {
  const people = await db.person.findMany({
    where: { role: { in: [Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER] } },
    select: { id: true },
  });
  let created = 0;
  for (const person of people) {
    if (input.dryRun) {
      const existing = await db.leaveAdjustment.findFirst({
        where: { personId: person.id, year: input.year },
        select: { id: true },
      });
      if (!existing) created += 1;
      continue;
    }
    const result = await backfillPersonYear(db, { ...input, personId: person.id });
    if (result.created) created += 1;
  }
  return { year: input.year, dryRun: input.dryRun, scanned: people.length, created };
}

async function main() {
  const args = parseArgsMap(process.argv.slice(2));
  const year = Number(args.get('--year') ?? new Date().getUTCFullYear());
  if (!Number.isFinite(year) || year < 1970 || year > 2200) {
    throw new Error(`Invalid --year value: ${year}`);
  }
  const report = await runLeaveAdjustmentBackfill(prisma, {
    year,
    reason: args.get('--reason') ?? 'FR-400 initial leave-adjustment backfill',
    createdBy: args.get('--created-by') ?? 'system:fr400-backfill',
    dryRun: args.get('--dry-run') === 'true',
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error('Leave-adjustment backfill failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
