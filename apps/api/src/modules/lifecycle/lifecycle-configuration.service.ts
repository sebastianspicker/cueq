/** Global lifecycle template, task-group, and automation configuration. */
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CreateLifecycleAutomationSchema,
  CreateLifecycleTemplateSchema,
  CreateTaskGroupSchema,
  CursorQuerySchema,
  LifecycleDefinitionSchema,
} from '@cueq/contracts';
import { Prisma } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { lockPersonWrites } from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { CapabilityHelper } from '../people/public.js';

type CapabilityClient = Pick<Prisma.TransactionClient, 'capabilityGrant'>;

function templateDto(template: {
  id: string;
  code: string;
  version: number;
  title: string;
  kind: string;
  status: string;
  definition: Prisma.JsonValue;
  activatedAt: Date | null;
  createdAt: Date;
}) {
  return {
    ...template,
    definition: LifecycleDefinitionSchema.parse(template.definition),
    activatedAt: template.activatedAt?.toISOString() ?? null,
    createdAt: template.createdAt.toISOString(),
  };
}

function groupDto(group: {
  id: string;
  name: string;
  createdAt: Date;
  members: Array<{ personId: string }>;
}) {
  return {
    id: group.id,
    name: group.name,
    personIds: group.members.map((member) => member.personId),
    createdAt: group.createdAt.toISOString(),
  };
}

function automationDto(rule: {
  id: string;
  name: string;
  templateId: string;
  organizationUnitId: string;
  trigger: string;
  triggerDate: Date | null;
  offsetDays: number;
  conditions: Prisma.JsonValue;
  enabled: boolean;
  authorizedById: string;
  createdAt: Date;
}) {
  return {
    ...rule,
    triggerDate: rule.triggerDate?.toISOString().slice(0, 10) ?? null,
    createdAt: rule.createdAt.toISOString(),
  };
}

@Injectable()
export class LifecycleConfigurationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CapabilityHelper) private readonly capabilities: CapabilityHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  private assertGlobalManage(actorId: string, tx: CapabilityClient = this.prisma) {
    return this.capabilities.assert(actorId, 'lifecycle.manage', {}, tx);
  }

  async templates(actorId: string, query: unknown) {
    await this.assertGlobalManage(actorId);
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.lifecycleTemplate.findMany({
      where: cursorWhere('createdAt', input.cursor),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, templateDto);
  }

  async createTemplate(actorId: string, payload: unknown) {
    const input = parseRequest(CreateLifecycleTemplateSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await this.assertGlobalManage(actorId, tx);
      const template = await tx.lifecycleTemplate.create({
        data: { ...input, definition: input.definition as Prisma.InputJsonValue },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'LIFECYCLE_TEMPLATE_CREATED',
          entityType: 'LifecycleTemplate',
          entityId: template.id,
          after: { code: template.code, version: template.version, status: template.status },
        },
        tx,
      );
      return templateDto(template);
    });
  }

  async editTemplate(actorId: string, templateId: string, payload: unknown) {
    const input = parseRequest(CreateLifecycleTemplateSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await this.assertGlobalManage(actorId, tx);
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM lifecycle_templates WHERE id = ${templateId} FOR UPDATE
      `);
      const current = await tx.lifecycleTemplate.findUnique({ where: { id: templateId } });
      if (!current) throw new NotFoundException('Lifecycle template not found.');
      if (current.status !== 'DRAFT') {
        throw new ConflictException('Only draft lifecycle templates can be edited.');
      }
      if (current.code !== input.code || current.version !== input.version) {
        throw new ConflictException('Template code and version are immutable.');
      }
      const updated = await tx.lifecycleTemplate.update({
        where: { id: templateId },
        data: {
          title: input.title,
          kind: input.kind,
          definition: input.definition as Prisma.InputJsonValue,
        },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'LIFECYCLE_TEMPLATE_UPDATED',
          entityType: 'LifecycleTemplate',
          entityId: templateId,
          before: { title: current.title, kind: current.kind },
          after: { title: updated.title, kind: updated.kind },
        },
        tx,
      );
      return templateDto(updated);
    });
  }

  async activateTemplate(actorId: string, templateId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertGlobalManage(actorId, tx);
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM lifecycle_templates WHERE id = ${templateId} FOR UPDATE
      `);
      const current = await tx.lifecycleTemplate.findUnique({ where: { id: templateId } });
      if (!current) throw new NotFoundException('Lifecycle template not found.');
      if (current.status === 'ACTIVE') return templateDto(current);
      if (current.status !== 'DRAFT') {
        throw new ConflictException('Only draft lifecycle templates can be activated.');
      }
      const activatedAt = new Date();
      const updated = await tx.lifecycleTemplate.update({
        where: { id: templateId },
        data: { status: 'ACTIVE', activatedAt },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'LIFECYCLE_TEMPLATE_ACTIVATED',
          entityType: 'LifecycleTemplate',
          entityId: templateId,
          after: { activatedAt: activatedAt.toISOString() },
        },
        tx,
      );
      return templateDto(updated);
    });
  }

  async groups(actorId: string, query: unknown) {
    await this.assertGlobalManage(actorId);
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.taskGroup.findMany({
      where: cursorWhere('createdAt', input.cursor),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      include: { members: { take: 101, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (rows.some((row) => row.members.length > 100)) {
      throw new ConflictException('Task group exceeds the supported member limit.');
    }
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, groupDto);
  }

  async createGroup(actorId: string, payload: unknown) {
    const input = parseRequest(CreateTaskGroupSchema, payload);
    const personIds = [...new Set(input.personIds)];
    return this.prisma.$transaction(async (tx) => {
      await this.assertGlobalManage(actorId, tx);
      await lockPersonWrites(tx, personIds);
      const people = await tx.person.count({ where: { id: { in: personIds } } });
      if (people !== personIds.length) throw new NotFoundException('Task group person not found.');
      const group = await tx.taskGroup.create({
        data: {
          name: input.name,
          members: { create: personIds.map((personId) => ({ personId })) },
        },
        include: { members: true },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'TASK_GROUP_CREATED',
          entityType: 'TaskGroup',
          entityId: group.id,
          after: { memberCount: personIds.length },
        },
        tx,
      );
      return groupDto(group);
    });
  }

  async automations(actorId: string, query: unknown) {
    await this.assertGlobalManage(actorId);
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.lifecycleAutomationRule.findMany({
      where: cursorWhere('createdAt', input.cursor),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, automationDto);
  }

  async createAutomation(actorId: string, payload: unknown) {
    const input = parseRequest(CreateLifecycleAutomationSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await this.assertGlobalManage(actorId, tx);
      const template = await tx.lifecycleTemplate.findUnique({ where: { id: input.templateId } });
      if (!template || template.status !== 'ACTIVE') {
        throw new ConflictException('Automation requires an active lifecycle template.');
      }
      const rule = await tx.lifecycleAutomationRule.create({
        data: {
          ...input,
          triggerDate: input.triggerDate ? new Date(`${input.triggerDate}T00:00:00.000Z`) : null,
          conditions: input.conditions as Prisma.InputJsonValue,
          enabled: true,
          authorizedById: actorId,
        },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'LIFECYCLE_AUTOMATION_CREATED',
          entityType: 'LifecycleAutomationRule',
          entityId: rule.id,
          after: { templateId: rule.templateId, trigger: rule.trigger, enabled: true },
        },
        tx,
      );
      return automationDto(rule);
    });
  }
}
