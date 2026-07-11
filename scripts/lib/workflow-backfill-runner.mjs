import { backfillWorkflow, workflowBackfillPatch } from './workflow-backfill.mjs';

export async function runWorkflowBackfill(db, input) {
  const policies = await db.workflowPolicy.findMany({
    select: { type: true, escalationDeadlineHours: true },
  });
  const deadlineByType = new Map(
    policies.map((policy) => [policy.type, policy.escalationDeadlineHours]),
  );
  const workflows = await db.workflowInstance.findMany({ orderBy: { createdAt: 'asc' } });
  let updated = 0;
  for (const workflow of workflows) {
    const deadlineHours =
      deadlineByType.get(workflow.type) ?? input.defaultDeadlines.get(workflow.type) ?? 48;
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
