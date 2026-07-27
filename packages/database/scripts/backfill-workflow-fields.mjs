#!/usr/bin/env node
/** Backfills workflow defaults and deadlines; --dry-run reports the planned changes without persisting them. */
import { PrismaClient, WorkflowType } from '@prisma/client';
import { runWorkflowBackfill } from '../../../scripts/lib/workflow-backfill-runner.mjs';
import { parseArgsMap } from '../../../scripts/lib/parse-args.mjs';

const prisma = new PrismaClient();
const args = parseArgsMap(process.argv.slice(2));
try {
  const report = await runWorkflowBackfill(prisma, {
    dryRun: args.get('--dry-run') === 'true',
    actorId: args.get('--actor-id') ?? 'system:workflow-backfill',
    defaultDeadlines: new Map([
      [WorkflowType.LEAVE_REQUEST, 48],
      [WorkflowType.BOOKING_CORRECTION, 48],
      [WorkflowType.POST_CLOSE_CORRECTION, 24],
      [WorkflowType.SHIFT_SWAP, 48],
      [WorkflowType.OVERTIME_APPROVAL, 48],
    ]),
  });
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.error('Workflow field backfill failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
