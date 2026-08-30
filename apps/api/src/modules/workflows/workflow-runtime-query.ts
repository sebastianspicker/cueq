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
): Promise<VisibleWorkflow[]> {
  const now = new Date();
  const where: Prisma.WorkflowInstanceWhereInput = HR_LIKE_ROLES.has(actor.role)
    ? { status: query.status, type: query.type }
    : {
        status: query.status,
        type: query.type,
        OR: [{ requesterId: actor.id }, { approverId: actor.id }],
      };
  const workflows = await prisma.workflowInstance.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
  const visible = workflows.map((workflow) => withVisibility(workflow, actor, now));
  return query.overdueOnly ? visible.filter((workflow) => workflow.isOverdue) : visible;
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
