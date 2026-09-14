/** Scoped lifecycle task inbox, dependency guards, and immutable completion history. */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CompleteLifecycleTaskSchema,
  CursorQuerySchema,
  TaskInboxQuerySchema,
} from '@cueq/contracts';
import { Prisma } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorSqlWhere, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { AuditHelper } from '../audit/public.js';
import { assertLifecycleTaskScope, lifecycleTaskScope } from './lifecycle-scope.js';

type TaskInboxRow = {
  id: string;
  instanceId: string;
  key: string;
  title: string;
  description: string;
  responsiblePersonId: string | null;
  responsibleGroupId: string | null;
  dependsOn: string[];
  blockedBy: string[];
  blocking: boolean;
  dueDate: Date;
  status: string;
  completedAt: Date | null;
  completedById: string | null;
  createdAt: Date;
  personId: string;
  assignmentId: string;
};

function inboxTaskDto(task: TaskInboxRow) {
  return {
    ...task,
    dueDate: task.dueDate.toISOString().slice(0, 10),
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

function historyDto(history: {
  id: string;
  taskId: string;
  actorId: string;
  action: string;
  reason: string;
  createdAt: Date;
}) {
  return { ...history, createdAt: history.createdAt.toISOString() };
}

function taskMutationDto(task: { dueDate: Date; completedAt: Date | null; createdAt: Date }) {
  return {
    ...task,
    dueDate: task.dueDate.toISOString().slice(0, 10),
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

@Injectable()
export class LifecycleTaskService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  async inbox(actorId: string, query: unknown) {
    const input = parseRequest(TaskInboxQuerySchema, query);
    const rows = await this.prisma.$queryRaw<TaskInboxRow[]>(Prisma.sql`
      SELECT t.id, t."instanceId", t.key, t.title, t.description, t."responsiblePersonId",
        t."responsibleGroupId", t."dependsOn", t.blocking, t."dueDate", t.status,
        t."completedAt", t."completedById", t."createdAt", i."personId", i."assignmentId",
        ARRAY(SELECT dependency.key FROM lifecycle_tasks dependency
          WHERE dependency."instanceId" = t."instanceId"
            AND dependency.key = ANY(t."dependsOn") AND dependency.status <> 'DONE'
          ORDER BY dependency.key) AS "blockedBy"
      FROM lifecycle_tasks t
      JOIN lifecycle_instances i ON i.id = t."instanceId"
      WHERE ${lifecycleTaskScope(actorId, 'tasks.read')}
        AND (${input.status ? Prisma.sql`t.status = ${input.status}` : Prisma.sql`TRUE`})
        AND (${input.assignmentId ? Prisma.sql`i."assignmentId" = ${input.assignmentId}` : Prisma.sql`TRUE`})
        AND ${cursorSqlWhere('createdAt', Prisma.sql`t."createdAt"`, Prisma.sql`t.id`, input.cursor)}
      ORDER BY t."createdAt" ASC, t.id ASC
      LIMIT ${input.limit + 1}
    `);
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, inboxTaskDto);
  }

  async complete(actorId: string, taskId: string, payload: unknown) {
    const input = parseRequest(CompleteLifecycleTaskSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM lifecycle_tasks WHERE id = ${taskId} FOR UPDATE
      `);
      await assertLifecycleTaskScope(tx, actorId, 'tasks.complete', taskId);
      const current = await tx.lifecycleTask.findUnique({ where: { id: taskId } });
      if (!current) throw new NotFoundException('Lifecycle task not found.');
      if (current.status === input.status) return taskMutationDto(current);
      if (input.status === 'DONE') {
        const blockers = await tx.lifecycleTask.count({
          where: {
            instanceId: current.instanceId,
            key: { in: current.dependsOn },
            status: { not: 'DONE' },
          },
        });
        if (blockers > 0) {
          throw new ConflictException('Lifecycle task dependencies are not complete.');
        }
      } else {
        const completedDependents = await tx.lifecycleTask.count({
          where: {
            instanceId: current.instanceId,
            dependsOn: { has: current.key },
            status: 'DONE',
          },
        });
        if (completedDependents > 0) {
          throw new ConflictException('A completed dependent task prevents reopening.');
        }
      }
      const completedAt = input.status === 'DONE' ? new Date() : null;
      const updated = await tx.lifecycleTask.update({
        where: { id: taskId },
        data: {
          status: input.status,
          completedAt,
          completedById: input.status === 'DONE' ? actorId : null,
        },
      });
      const blockingTasks = await tx.lifecycleTask.count({
        where: { instanceId: current.instanceId, blocking: true },
      });
      const unfinishedTasks = await tx.lifecycleTask.count({
        where: {
          instanceId: current.instanceId,
          status: { not: 'DONE' },
          ...(blockingTasks > 0 ? { blocking: true } : {}),
        },
      });
      await tx.lifecycleInstance.update({
        where: { id: current.instanceId },
        data: { status: unfinishedTasks === 0 ? 'COMPLETE' : 'ACTIVE' },
      });
      const action = input.status === 'DONE' ? 'TASK_DONE' : 'TASK_REOPENED';
      await tx.lifecycleTaskHistory.create({
        data: { taskId, actorId, action, reason: input.reason },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: `LIFECYCLE_${action}`,
          entityType: 'LifecycleTask',
          entityId: taskId,
          before: { status: current.status },
          after: { status: updated.status, completedAt: completedAt?.toISOString() ?? null },
          reason: input.reason,
        },
        tx,
      );
      return taskMutationDto(updated);
    });
  }

  async history(actorId: string, taskId: string, query: unknown) {
    await assertLifecycleTaskScope(this.prisma, actorId, 'tasks.read', taskId);
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.lifecycleTaskHistory.findMany({
      where: { taskId, ...cursorWhere('createdAt', input.cursor) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, historyDto);
  }
}
