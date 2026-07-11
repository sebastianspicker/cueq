#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import database from '../packages/database/dist/index.js';
import { parseArgsMap } from './lib/parse-args.mjs';
import { backfillWorkflow, workflowBackfillPatch } from './lib/workflow-backfill.mjs';
export { backfillWorkflow, workflowBackfillPatch } from './lib/workflow-backfill.mjs';

const { prisma, WorkflowType } = database;

const DEFAULT_DEADLINE_HOURS = new Map([
  [WorkflowType.LEAVE_REQUEST, 48],
  [WorkflowType.BOOKING_CORRECTION, 48],
  [WorkflowType.POST_CLOSE_CORRECTION, 24],
  [WorkflowType.SHIFT_SWAP, 48],
  [WorkflowType.OVERTIME_APPROVAL, 48],
]);

export async function runWorkflowBackfill(db, input) {
  const policies = await db.workflowPolicy.findMany({
    select: { type: true, escalationDeadlineHours: true },
  });
  const deadlineByType = new Map(
    policies.map((policy) => [policy.type, policy.escalationDeadlineHours]),
  );
  const workflows = await db.workflowInstance.findMany({
    orderBy: { createdAt: 'asc' },
  });
  let updated = 0;
  for (const workflow of workflows) {
    const deadlineHours =
      deadlineByType.get(workflow.type) ?? DEFAULT_DEADLINE_HOURS.get(workflow.type) ?? 48;
    if (input.dryRun) {
      if (Object.keys(workflowBackfillPatch(workflow, deadlineHours)).length > 0) updated += 1;
      continue;
    }
    const result = await backfillWorkflow(db, {
      workflowId: workflow.id,
      deadlineHours,
      actorId: input.actorId,
    });
    if (result.updated) updated += 1;
  }
  return { dryRun: input.dryRun, scanned: workflows.length, updated };
}

async function main() {
  const args = parseArgsMap(process.argv.slice(2));
  const report = await runWorkflowBackfill(prisma, {
    dryRun: args.get('--dry-run') === 'true',
    actorId: args.get('--actor-id') ?? 'system:workflow-backfill',
  });
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((error) => {
      console.error('Workflow field backfill failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
