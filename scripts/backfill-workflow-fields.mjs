#!/usr/bin/env node
import { prisma, WorkflowStatus, WorkflowType } from '@cueq/database';

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

const DEFAULT_DEADLINE_HOURS = new Map([
  [WorkflowType.LEAVE_REQUEST, 48],
  [WorkflowType.BOOKING_CORRECTION, 48],
  [WorkflowType.POST_CLOSE_CORRECTION, 24],
  [WorkflowType.SHIFT_SWAP, 48],
  [WorkflowType.OVERTIME_APPROVAL, 48],
]);

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3_600_000);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = args.get('--dry-run') === 'true';

  const policies = await prisma.workflowPolicy.findMany({
    select: { type: true, escalationDeadlineHours: true },
  });
  const policyDeadlineByType = new Map(
    policies.map((policy) => [policy.type, policy.escalationDeadlineHours]),
  );

  const workflows = await prisma.workflowInstance.findMany({
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;
  for (const workflow of workflows) {
    const submittedAt = workflow.submittedAt ?? workflow.createdAt;
    const deadlineHours =
      policyDeadlineByType.get(workflow.type) ?? DEFAULT_DEADLINE_HOURS.get(workflow.type) ?? 48;

    const shouldHaveDueAt =
      workflow.status === WorkflowStatus.SUBMITTED ||
      workflow.status === WorkflowStatus.PENDING ||
      workflow.status === WorkflowStatus.ESCALATED;
    const dueAt = shouldHaveDueAt ? (workflow.dueAt ?? addHours(submittedAt, deadlineHours)) : null;

    const delegationTrail =
      workflow.delegationTrail ??
      (workflow.approverId ? [workflow.approverId] : workflow.delegationTrail);

    const needsUpdate =
      workflow.submittedAt === null ||
      (shouldHaveDueAt && workflow.dueAt === null) ||
      workflow.delegationTrail === null;

    if (!needsUpdate) {
      continue;
    }

    updated += 1;
    if (dryRun) {
      continue;
    }

    await prisma.workflowInstance.update({
      where: { id: workflow.id },
      data: {
        submittedAt,
        dueAt,
        delegationTrail,
      },
    });
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        scanned: workflows.length,
        updated,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('Workflow field backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
