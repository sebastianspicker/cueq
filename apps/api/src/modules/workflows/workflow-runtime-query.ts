import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { NotFoundException } from '@nestjs/common';
import type { Prisma, WorkflowInstance } from '@cueq/database';
import type { WorkflowAction, WorkflowInboxQuery } from '@cueq/contracts';
import type { PrismaService } from '../../persistence/prisma.service.js';
import { HR_LIKE_ROLES } from '../people/public.js';
import type { WorkflowActor } from './workflow-contracts.js';
import {
  availableWorkflowActions,
  ensureMayAccessWorkflow,
  isWorkflowOverdue,
  mayViewWorkflowReason,
} from './workflow-action-visibility.js';

export type VisibleWorkflow = WorkflowInstance & {
  isOverdue: boolean;
  availableActions: WorkflowAction[];
};

function withVisibility(
  workflow: WorkflowInstance,
  actor: WorkflowActor,
  now: Date,
): VisibleWorkflow {
  const canSeeReason = mayViewWorkflowReason(workflow, actor);
  return {
    ...workflow,
    reason: canSeeReason ? workflow.reason : null,
    decisionReason: canSeeReason ? workflow.decisionReason : null,
    isOverdue: isWorkflowOverdue(workflow, now),
    availableActions: availableWorkflowActions(workflow, actor),
  };
}

export async function listWorkflowInbox(
  prisma: Pick<PrismaService, 'workflowInstance'>,
  actor: WorkflowActor,
  query: WorkflowInboxQuery,
) {
  const now = new Date();
  const where: Prisma.WorkflowInstanceWhereInput = HR_LIKE_ROLES.has(actor.role)
    ? { assignmentId: query.assignmentId, status: query.status, type: query.type }
    : {
        assignmentId: query.assignmentId,
        status: query.status,
        type: query.type,
        OR: [{ requesterId: actor.id }, { approverId: actor.id }],
      };
  const workflows = await prisma.workflowInstance.findMany({
    where: {
      AND: [
        where,
        cursorWhere('createdAt', query.cursor),
        ...(query.overdueOnly
          ? [{ dueAt: { lte: now }, status: { in: ['PENDING' as const, 'ESCALATED' as const] } }]
          : []),
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: query.limit + 1,
  });
  return cursorPage(
    workflows,
    query.limit,
    'createdAt',
    (row) => row.createdAt,
    (workflow) => withVisibility(workflow, actor, now),
  );
}

export async function getWorkflowDetail(
  prisma: Pick<PrismaService, 'workflowInstance'>,
  actor: WorkflowActor,
  workflowId: string,
): Promise<VisibleWorkflow> {
  const workflow = await prisma.workflowInstance.findUnique({ where: { id: workflowId } });
  if (!workflow) throw new NotFoundException('Workflow not found.');
  ensureMayAccessWorkflow(workflow, actor);
  return withVisibility(workflow, actor, new Date());
}
