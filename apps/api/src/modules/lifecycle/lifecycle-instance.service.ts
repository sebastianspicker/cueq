/** Immutable lifecycle instance activation and bounded scoped reads. */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateLifecycleInstanceSchema,
  LifecycleDefinitionSchema,
  LifecycleInstanceQuerySchema,
} from '@cueq/contracts';
import { Prisma } from '@cueq/database';
import {
  INBOX_NOTIFICATIONS_PORT,
  type InboxNotificationInput,
  type InboxNotificationsPort,
} from '../../application/ports/inbox-notifications.port.js';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorSqlWhere } from '../../persistence/queries/cursor-page.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { AssignmentHelper, CapabilityHelper } from '../people/public.js';
import { addLifecycleDays, lifecycleDate } from './lifecycle-date.js';
import { orderedLifecycleTasks } from './lifecycle-definition.js';
import {
  assertLifecycleActivationScope,
  assertLifecycleInstanceScope,
  lifecycleInstanceScope,
} from './lifecycle-scope.js';

type ActivationOptions = { automationRuleId?: string };
type InstanceRow = {
  id: string;
  templateId: string;
  assignmentId: string;
  personId: string;
  organizationUnitId: string;
  eventKey: string;
  snapshot: Prisma.JsonValue;
  baseDate: Date;
  status: string;
  createdAt: Date;
};
type TaskRow = {
  id: string;
  instanceId: string;
  key: string;
  title: string;
  description: string;
  responsiblePersonId: string | null;
  responsibleGroupId: string | null;
  dependsOn: string[];
  blocking: boolean;
  dueDate: Date;
  status: string;
  completedAt: Date | null;
  completedById: string | null;
  createdAt: Date;
};

function taskDto(task: TaskRow) {
  return {
    ...task,
    dueDate: task.dueDate.toISOString().slice(0, 10),
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
  };
}

function instanceDto(instance: InstanceRow) {
  return {
    ...instance,
    baseDate: instance.baseDate.toISOString().slice(0, 10),
    createdAt: instance.createdAt.toISOString(),
  };
}

function snapshotTaskDtos(snapshot: Prisma.JsonValue, tasks: TaskRow[]) {
  const definition = LifecycleDefinitionSchema.parse(
    (snapshot as { definition?: unknown }).definition,
  );
  const order = new Map(orderedLifecycleTasks(definition).map((task, index) => [task.key, index]));
  return [...tasks]
    .sort((left, right) => (order.get(left.key) ?? 101) - (order.get(right.key) ?? 101))
    .map(taskDto);
}

type OrderedTask = ReturnType<typeof orderedLifecycleTasks>[number];

function taskResponsibility(task: OrderedTask, subjectPersonId: string) {
  if (task.responsibleKind === 'SUBJECT') {
    return { responsiblePersonId: subjectPersonId, responsibleGroupId: null };
  }
  if (task.responsibleKind === 'PERSON') {
    return { responsiblePersonId: task.responsibleId, responsibleGroupId: null };
  }
  return { responsiblePersonId: null, responsibleGroupId: task.responsibleId };
}

function responsibilityTargets(tasks: OrderedTask[], subjectPersonId: string) {
  const people = new Set<string>();
  const groups = new Set<string>();
  for (const task of tasks) {
    const target = taskResponsibility(task, subjectPersonId);
    if (target.responsiblePersonId) people.add(target.responsiblePersonId);
    if (target.responsibleGroupId) groups.add(target.responsibleGroupId);
  }
  return { personIds: [...people], groupIds: [...groups] };
}

@Injectable()
export class LifecycleInstanceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AssignmentHelper) private readonly assignments: AssignmentHelper,
    @Inject(CapabilityHelper) private readonly capabilities: CapabilityHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
    @Inject(INBOX_NOTIFICATIONS_PORT) private readonly notifications: InboxNotificationsPort,
  ) {}

  async activate(actorId: string, payload: unknown, options: ActivationOptions = {}) {
    const input = parseRequest(CreateLifecycleInstanceSchema, payload);
    const baseDate = lifecycleDate(input.baseDate);
    const endDate = addLifecycleDays(baseDate, 1);
    return this.prisma.$transaction(async (tx) => {
      if (options.automationRuleId) {
        await this.capabilities.assert(actorId, 'lifecycle.manage', {}, tx);
      } else {
        await assertLifecycleActivationScope(
          tx,
          actorId,
          input.personId,
          input.assignmentId,
          baseDate,
          endDate,
        );
      }
      await lockPersonWrites(tx, [input.personId]);
      if (options.automationRuleId) {
        const rule = await tx.lifecycleAutomationRule.findUnique({
          where: { id: options.automationRuleId },
        });
        if (
          !rule?.enabled ||
          rule.authorizedById !== actorId ||
          rule.templateId !== input.templateId
        ) {
          throw new ConflictException('Lifecycle automation is no longer enabled.');
        }
        await this.capabilities.assert(actorId, 'lifecycle.manage', {}, tx);
      } else {
        await assertLifecycleActivationScope(
          tx,
          actorId,
          input.personId,
          input.assignmentId,
          baseDate,
          endDate,
        );
      }
      const employment = await this.assignments.resolveInterval(
        input.personId,
        baseDate,
        endDate,
        input.assignmentId,
        tx,
      );
      const existing = await tx.lifecycleInstance.findUnique({
        where: {
          templateId_assignmentId_eventKey: {
            templateId: input.templateId,
            assignmentId: input.assignmentId,
            eventKey: input.eventKey,
          },
        },
        include: { tasks: { take: 101 } },
      });
      if (existing) {
        if (existing.tasks.length > 100) {
          throw new ConflictException('Lifecycle instance exceeds the task limit.');
        }
        return {
          ...instanceDto(existing),
          tasks: snapshotTaskDtos(existing.snapshot, existing.tasks),
        };
      }
      const template = await tx.lifecycleTemplate.findUnique({ where: { id: input.templateId } });
      if (!template || template.status !== 'ACTIVE') {
        throw new ConflictException('Lifecycle instance requires an active template.');
      }
      const definition = LifecycleDefinitionSchema.parse(template.definition);
      const ordered = orderedLifecycleTasks(definition);
      const { personIds: personTargets, groupIds: groupTargets } = responsibilityTargets(
        ordered,
        input.personId,
      );
      const peopleCount = await tx.person.count({ where: { id: { in: personTargets } } });
      const groupsCount = await tx.taskGroup.count({ where: { id: { in: groupTargets } } });
      if (peopleCount !== personTargets.length || groupsCount !== groupTargets.length) {
        throw new ConflictException('Lifecycle task responsibility target no longer exists.');
      }
      const snapshot = {
        template: {
          code: template.code,
          version: template.version,
          title: template.title,
          kind: template.kind,
        },
        definition,
      };
      const instance = await tx.lifecycleInstance.create({
        data: {
          templateId: template.id,
          assignmentId: input.assignmentId,
          personId: input.personId,
          organizationUnitId: employment.organizationUnitId,
          eventKey: input.eventKey,
          snapshot: snapshot as Prisma.InputJsonValue,
          baseDate,
        },
      });
      const tasks = [];
      for (const task of ordered) {
        const responsibility = taskResponsibility(task, input.personId);
        tasks.push(
          await tx.lifecycleTask.create({
            data: {
              instanceId: instance.id,
              key: task.key,
              title: task.title,
              description: task.description,
              ...responsibility,
              dependsOn: task.dependsOn,
              blocking: task.blocking,
              dueDate: addLifecycleDays(baseDate, task.dueOffsetDays),
            },
          }),
        );
      }
      await this.appendTaskNotifications(tx, tasks);
      await this.audit.appendAudit(
        {
          actorId,
          action: 'LIFECYCLE_INSTANCE_ACTIVATED',
          entityType: 'LifecycleInstance',
          entityId: instance.id,
          after: {
            templateId: template.id,
            personId: input.personId,
            assignmentId: input.assignmentId,
            eventKey: input.eventKey,
            taskCount: tasks.length,
          },
        },
        tx,
      );
      return { ...instanceDto(instance), tasks: tasks.map(taskDto) };
    });
  }

  private async appendTaskNotifications(
    tx: Prisma.TransactionClient,
    tasks: Array<{
      id: string;
      responsiblePersonId: string | null;
      responsibleGroupId: string | null;
    }>,
  ) {
    const groupIds = [
      ...new Set(
        tasks.flatMap((task) => (task.responsibleGroupId ? [task.responsibleGroupId] : [])),
      ),
    ];
    const members = await tx.taskGroupMember.findMany({
      where: { groupId: { in: groupIds } },
      select: { groupId: true, personId: true },
      take: 10_001,
    });
    if (members.length > 10_000) {
      throw new ConflictException('Lifecycle task notification recipients exceed the limit.');
    }
    const byGroup = new Map<string, string[]>();
    for (const member of members) {
      const existing = byGroup.get(member.groupId);
      if (existing) existing.push(member.personId);
      else byGroup.set(member.groupId, [member.personId]);
    }
    const notifications: InboxNotificationInput[] = [];
    for (const task of tasks) {
      const recipients = task.responsiblePersonId
        ? [task.responsiblePersonId]
        : (byGroup.get(task.responsibleGroupId ?? '') ?? []);
      for (const recipientId of recipients) {
        notifications.push({
          recipientId,
          resourceType: 'LifecycleTask',
          resourceId: task.id,
          messageCode: 'TASK_ASSIGNED',
          dedupeKey: `task-assigned:${task.id}:${recipientId}`,
        });
      }
    }
    await this.notifications.append(tx, notifications);
  }

  async list(actorId: string, query: unknown) {
    const input = parseRequest(LifecycleInstanceQuerySchema, query);
    const rows = await this.prisma.$queryRaw<InstanceRow[]>(Prisma.sql`
      SELECT i.id, i."templateId", i."assignmentId", i."personId", i."organizationUnitId",
        i."eventKey", i.snapshot, i."baseDate", i.status, i."createdAt"
      FROM lifecycle_instances i
      WHERE ${lifecycleInstanceScope(actorId)}
        AND (${input.personId ? Prisma.sql`i."personId" = ${input.personId}` : Prisma.sql`TRUE`})
        AND (${input.assignmentId ? Prisma.sql`i."assignmentId" = ${input.assignmentId}` : Prisma.sql`TRUE`})
        AND ${cursorSqlWhere('createdAt', Prisma.sql`i."createdAt"`, Prisma.sql`i.id`, input.cursor)}
      ORDER BY i."createdAt" ASC, i.id ASC
      LIMIT ${input.limit + 1}
    `);
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, instanceDto);
  }

  async detail(actorId: string, instanceId: string) {
    await assertLifecycleInstanceScope(this.prisma, actorId, instanceId);
    const instance = await this.prisma.lifecycleInstance.findUnique({
      where: { id: instanceId },
      include: { tasks: { take: 101, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!instance) throw new NotFoundException('Lifecycle instance not found.');
    if (instance.tasks.length > 100) {
      throw new ConflictException('Lifecycle instance exceeds the task limit.');
    }
    return {
      ...instanceDto(instance),
      tasks: snapshotTaskDtos(instance.snapshot, instance.tasks),
    };
  }
}
