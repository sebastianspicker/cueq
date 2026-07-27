/** Calculates and applies missing workflow compatibility fields without overwriting newer data. */
const ACTIVE_STATUSES = new Set(['SUBMITTED', 'PENDING', 'ESCALATED']);

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3_600_000);
}

/** Derives only the null compatibility fields that an older workflow row still needs. */
export function workflowBackfillPatch(workflow, deadlineHours) {
  const patch = {};
  const submittedAt = workflow.submittedAt ?? workflow.createdAt;
  if (workflow.submittedAt === null) patch.submittedAt = submittedAt;
  if (ACTIVE_STATUSES.has(workflow.status) && workflow.dueAt === null) {
    patch.dueAt = addHours(submittedAt, deadlineHours);
  }
  if (workflow.delegationTrail === null) {
    patch.delegationTrail = workflow.approverId ? [workflow.approverId] : null;
  }
  return patch;
}

function auditSnapshot(workflow) {
  return {
    submittedAt: workflow.submittedAt?.toISOString() ?? null,
    dueAt: workflow.dueAt?.toISOString() ?? null,
    delegationTrail: workflow.delegationTrail,
  };
}

/** Lock, re-read, patch, and audit one workflow so concurrent workers converge safely. */
export async function backfillWorkflow(db, input) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`cueq:workflow-backfill:${input.workflowId}`}))
    `;
    const workflow = await tx.workflowInstance.findUnique({ where: { id: input.workflowId } });
    if (!workflow) return { updated: false };
    const patch = workflowBackfillPatch(workflow, input.deadlineHours);
    if (Object.keys(patch).length === 0) return { updated: false };
    const before = auditSnapshot(workflow);
    const updated = await tx.workflowInstance.update({ where: { id: workflow.id }, data: patch });
    await tx.auditEntry.create({
      data: {
        actorId: input.actorId,
        action: 'WORKFLOW_FIELDS_BACKFILLED',
        entityType: 'WorkflowInstance',
        entityId: workflow.id,
        before,
        after: auditSnapshot(updated),
        reason: 'Null-only workflow field backfill',
      },
    });
    return { updated: true };
  });
}
