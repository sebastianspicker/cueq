#!/usr/bin/env node
/** Backfills missing leave-adjustment records for a year; --dry-run reports proposed changes without writing them. */
import { PrismaClient, Role } from '@prisma/client';
import { runLeaveAdjustmentBackfill } from '../../../scripts/lib/leave-adjustment-backfill-runner.mjs';
import { parseArgsMap } from '../../../scripts/lib/parse-args.mjs';

const prisma = new PrismaClient();
const args = parseArgsMap(process.argv.slice(2));
const year = Number(args.get('--year') ?? new Date().getUTCFullYear());

try {
  if (!Number.isFinite(year) || year < 1970 || year > 2200) {
    throw new Error(`Invalid --year value: ${year}`);
  }
  const report = await runLeaveAdjustmentBackfill(
    prisma,
    {
      year,
      reason: args.get('--reason') ?? 'FR-400 initial leave-adjustment backfill',
      createdBy: args.get('--created-by') ?? 'system:fr400-backfill',
      dryRun: args.get('--dry-run') === 'true',
    },
    [Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER],
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Leave-adjustment backfill failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
