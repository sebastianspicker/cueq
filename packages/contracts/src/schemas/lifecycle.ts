/** Bounded declarative lifecycle configuration; no scripts or employment decisions. */
import { z } from 'zod';
import { CursorQuerySchema, DateSchema, DateTimeSchema, IdSchema } from './common.js';

const TaskDefinitionSchema = z
  .object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(4000),
    responsibleKind: z.enum(['SUBJECT', 'PERSON', 'GROUP']),
    responsibleId: IdSchema.nullable(),
    dueOffsetDays: z.number().int().min(-365).max(365),
    dependsOn: z.array(z.string().max(80)).max(100),
    blocking: z.boolean(),
  })
  .strict()
  .refine((v) => (v.responsibleKind === 'SUBJECT') === (v.responsibleId === null), {
    message: 'Responsible target does not match its kind',
  });

export const LifecycleDefinitionSchema = z
  .object({ tasks: z.array(TaskDefinitionSchema).min(1).max(100) })
  .strict()
  .superRefine(({ tasks }, ctx) => {
    const keys = new Set(tasks.map((t) => t.key));
    if (
      keys.size !== tasks.length ||
      tasks.some(
        (t) =>
          new Set(t.dependsOn).size !== t.dependsOn.length ||
          t.dependsOn.some((key) => !keys.has(key)),
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Task keys and dependencies must be unique and reference existing tasks',
      });
      return;
    }
    const visited = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const task of tasks)
        if (!visited.has(task.key) && task.dependsOn.every((key) => visited.has(key))) {
          visited.add(task.key);
          progress = true;
        }
    }
    if (visited.size !== tasks.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Task dependencies must not contain cycles',
      });
  });
export const CreateLifecycleTemplateSchema = z
  .object({
    code: z.string().min(1).max(100),
    version: z.number().int().positive(),
    title: z.string().min(1).max(200),
    kind: z.enum(['ONBOARDING', 'OFFBOARDING']),
    definition: LifecycleDefinitionSchema,
  })
  .strict();
export const CreateLifecycleInstanceSchema = z
  .object({
    templateId: IdSchema,
    personId: IdSchema,
    assignmentId: IdSchema,
    eventKey: z.string().min(1).max(200),
    baseDate: DateSchema,
  })
  .strict();
export const LifecycleInstanceQuerySchema = CursorQuerySchema.extend({
  personId: IdSchema.optional(),
  assignmentId: IdSchema.optional(),
});
export const TaskInboxQuerySchema = CursorQuerySchema.extend({
  status: z.enum(['OPEN', 'DONE']).optional(),
  assignmentId: IdSchema.optional(),
});
export const CompleteLifecycleTaskSchema = z
  .object({ status: z.enum(['DONE', 'OPEN']), reason: z.string().trim().min(1).max(1000) })
  .strict();
export const CreateTaskGroupSchema = z
  .object({ name: z.string().trim().min(1).max(200), personIds: z.array(IdSchema).min(1).max(100) })
  .strict();
export const CreateLifecycleAutomationSchema = z
  .object({
    name: z.string().min(1).max(200),
    templateId: IdSchema,
    organizationUnitId: IdSchema,
    trigger: z.enum(['APPOINTMENT_START', 'APPOINTMENT_END', 'DATE']),
    triggerDate: DateSchema.nullable(),
    offsetDays: z.number().int().min(-365).max(365),
    conditions: z
      .object({
        employmentGroupId: IdSchema.optional(),
        sourceSystem: z.string().max(100).optional(),
      })
      .strict(),
  })
  .strict()
  .refine((v) => (v.trigger === 'DATE') === (v.triggerDate !== null), {
    message: 'Only DATE triggers require a trigger date',
  });

export const LifecycleTemplateSchema = CreateLifecycleTemplateSchema.extend({
  id: IdSchema,
  status: z.enum(['DRAFT', 'ACTIVE']),
  activatedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
export const TaskGroupSchema = CreateTaskGroupSchema.extend({
  id: IdSchema,
  createdAt: DateTimeSchema,
});
export const LifecycleAutomationSchema = z.object({
  id: IdSchema,
  name: z.string(),
  templateId: IdSchema,
  organizationUnitId: IdSchema,
  trigger: z.enum(['APPOINTMENT_START', 'APPOINTMENT_END', 'DATE']),
  triggerDate: DateSchema.nullable(),
  offsetDays: z.number().int(),
  conditions: z.object({
    employmentGroupId: IdSchema.optional(),
    sourceSystem: z.string().optional(),
  }),
  enabled: z.boolean(),
  authorizedById: IdSchema,
  createdAt: DateTimeSchema,
});
export const LifecycleInstanceSchema = CreateLifecycleInstanceSchema.extend({
  id: IdSchema,
  organizationUnitId: IdSchema,
  snapshot: z.object({
    template: z.object({
      code: z.string(),
      version: z.number().int().positive(),
      title: z.string(),
      kind: z.enum(['ONBOARDING', 'OFFBOARDING']),
    }),
    definition: LifecycleDefinitionSchema,
  }),
  status: z.enum(['ACTIVE', 'COMPLETE']),
  createdAt: DateTimeSchema,
});
export const LifecycleTaskSchema = z.object({
  id: IdSchema,
  instanceId: IdSchema,
  key: z.string(),
  title: z.string(),
  description: z.string(),
  responsiblePersonId: IdSchema.nullable(),
  responsibleGroupId: IdSchema.nullable(),
  dependsOn: z.array(z.string()),
  blocking: z.boolean(),
  dueDate: DateSchema,
  status: z.enum(['OPEN', 'DONE']),
  completedAt: DateTimeSchema.nullable(),
  completedById: IdSchema.nullable(),
  createdAt: DateTimeSchema,
});
export const LifecycleInstanceDetailSchema = LifecycleInstanceSchema.extend({
  tasks: z.array(LifecycleTaskSchema).max(100),
});
export const LifecycleTaskInboxItemSchema = LifecycleTaskSchema.extend({
  blockedBy: z.array(z.string()),
  personId: IdSchema,
  assignmentId: IdSchema,
});
export const LifecycleTaskHistorySchema = z.object({
  id: IdSchema,
  taskId: IdSchema,
  actorId: IdSchema,
  action: z.enum(['TASK_DONE', 'TASK_REOPENED']),
  reason: z.string(),
  createdAt: DateTimeSchema,
});
export const InboxNotificationSchema = z.object({
  id: IdSchema,
  resourceType: z.enum(['LifecycleTask', 'PersonnelDocument']),
  resourceId: IdSchema,
  messageCode: z.enum(['TASK_ASSIGNED', 'TASK_DUE', 'DOCUMENT_EXPIRING']),
  readAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
});
const page = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item).max(100), nextCursor: z.string().nullable() });
export const LifecycleTemplatePageSchema = page(LifecycleTemplateSchema);
export const TaskGroupPageSchema = page(TaskGroupSchema);
export const LifecycleAutomationPageSchema = page(LifecycleAutomationSchema);
export const LifecycleInstancePageSchema = page(LifecycleInstanceSchema);
export const LifecycleTaskInboxPageSchema = page(LifecycleTaskInboxItemSchema);
export const LifecycleTaskHistoryPageSchema = page(LifecycleTaskHistorySchema);
export const InboxNotificationPageSchema = page(InboxNotificationSchema);
export type LifecycleTemplate = z.infer<typeof LifecycleTemplateSchema>;
export type LifecycleInstance = z.infer<typeof LifecycleInstanceSchema>;
export type LifecycleTask = z.infer<typeof LifecycleTaskSchema>;
export type LifecycleTaskInboxItem = z.infer<typeof LifecycleTaskInboxItemSchema>;
export type InboxNotification = z.infer<typeof InboxNotificationSchema>;
