/** Bounded declarative lifecycle automation with deterministic idempotency keys. */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { z } from 'zod';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorWhere } from '../../persistence/queries/cursor-page.js';
import { AssignmentHelper } from '../people/public.js';
import { addLifecycleDays, lifecycleDateString, lifecycleToday } from './lifecycle-date.js';
import { LifecycleInstanceService } from './lifecycle-instance.service.js';

const AUTOMATION_BATCH_SIZE = 100;
const ConditionsSchema = z.object({
  employmentGroupId: z.string().cuid().optional(),
  sourceSystem: z.string().max(100).optional(),
});

type AutomationRule = {
  id: string;
  templateId: string;
  organizationUnitId: string;
  trigger: string;
  triggerDate: Date | null;
  offsetDays: number;
  conditions: unknown;
  authorizedById: string;
  createdAt: Date;
};
type AutomationAssignment = {
  id: string;
  personId: string;
  sourceSystem: string;
  employmentStartDate: Date | null;
  employmentEndDate: Date | null;
  createdAt: Date;
};

function encodeCursor(row: { id: string; createdAt: Date }) {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      field: 'createdAt',
      at: row.createdAt.toISOString(),
      id: row.id,
    }),
  ).toString('base64url');
}

function triggerBaseDate(rule: AutomationRule, assignment: AutomationAssignment) {
  if (rule.trigger === 'APPOINTMENT_START') return assignment.employmentStartDate;
  if (rule.trigger === 'APPOINTMENT_END') return assignment.employmentEndDate;
  return rule.triggerDate;
}

@Injectable()
export class LifecycleAutomationWorker implements OnApplicationBootstrap {
  private readonly logger = new Logger(LifecycleAutomationWorker.name);
  private readonly assignmentCursors = new Map<string, string>();
  private ruleCursor: string | undefined;
  private running = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AssignmentHelper) private readonly assignments: AssignmentHelper,
    @Inject(LifecycleInstanceService) private readonly instances: LifecycleInstanceService,
  ) {}

  onApplicationBootstrap() {
    void this.poll();
  }

  @Interval(30_000)
  async poll() {
    if (this.running) return;
    this.running = true;
    try {
      await this.runOnce();
    } catch {
      this.logger.warn('Lifecycle automation scan paused and will retry.');
    } finally {
      this.running = false;
    }
  }

  async runOnce() {
    const rules = await this.prisma.lifecycleAutomationRule.findMany({
      where: { enabled: true, ...cursorWhere('createdAt', this.ruleCursor) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: AUTOMATION_BATCH_SIZE + 1,
    });
    for (const rule of rules.slice(0, AUTOMATION_BATCH_SIZE)) {
      await this.scanRule(rule);
    }
    const last = rules.at(Math.min(AUTOMATION_BATCH_SIZE, rules.length) - 1);
    this.ruleCursor = rules.length > AUTOMATION_BATCH_SIZE && last ? encodeCursor(last) : undefined;
  }

  private async scanRule(rule: AutomationRule) {
    const conditions = ConditionsSchema.parse(rule.conditions);
    const today = lifecycleToday();
    const createdDate = lifecycleToday(rule.createdAt);
    const earliestBase = addLifecycleDays(createdDate, -rule.offsetDays);
    const latestBase = addLifecycleDays(today, -rule.offsetDays);
    if (rule.trigger === 'DATE') {
      const dueDate = rule.triggerDate ? addLifecycleDays(rule.triggerDate, rule.offsetDays) : null;
      if (!dueDate || dueDate < createdDate || dueDate > today) return;
    }
    const candidates = await this.prisma.employmentAssignment.findMany({
      where: {
        ...cursorWhere('createdAt', this.assignmentCursors.get(rule.id)),
        ...(conditions.sourceSystem ? { sourceSystem: conditions.sourceSystem } : {}),
        ...this.triggerWhere(rule, earliestBase, latestBase),
        terms: {
          some: {
            organizationUnitId: rule.organizationUnitId,
            ...(conditions.employmentGroupId
              ? { employmentGroupId: conditions.employmentGroupId }
              : {}),
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: AUTOMATION_BATCH_SIZE + 1,
      select: {
        id: true,
        personId: true,
        sourceSystem: true,
        employmentStartDate: true,
        employmentEndDate: true,
        createdAt: true,
      },
    });
    for (const assignment of candidates.slice(0, AUTOMATION_BATCH_SIZE)) {
      await this.activateCandidate(rule, assignment, conditions, createdDate, today);
    }
    const last = candidates.at(Math.min(AUTOMATION_BATCH_SIZE, candidates.length) - 1);
    if (candidates.length > AUTOMATION_BATCH_SIZE && last) {
      this.assignmentCursors.set(rule.id, encodeCursor(last));
    } else {
      this.assignmentCursors.delete(rule.id);
    }
  }

  private triggerWhere(rule: AutomationRule, earliestBase: Date, latestBase: Date) {
    if (rule.trigger === 'APPOINTMENT_START') {
      return { employmentStartDate: { gte: earliestBase, lte: latestBase } };
    }
    if (rule.trigger === 'APPOINTMENT_END') {
      return { employmentEndDate: { gte: earliestBase, lte: latestBase } };
    }
    const baseDate = rule.triggerDate;
    return baseDate
      ? {
          AND: [
            { OR: [{ employmentStartDate: null }, { employmentStartDate: { lte: baseDate } }] },
            { OR: [{ employmentEndDate: null }, { employmentEndDate: { gte: baseDate } }] },
          ],
        }
      : { id: '__invalid_date_rule__' };
  }

  private async activateCandidate(
    rule: AutomationRule,
    assignment: AutomationAssignment,
    conditions: z.infer<typeof ConditionsSchema>,
    createdDate: Date,
    today: Date,
  ) {
    const baseDate = triggerBaseDate(rule, assignment);
    if (!baseDate) return;
    const dueDate = addLifecycleDays(baseDate, rule.offsetDays);
    if (dueDate < createdDate || dueDate > today) return;
    const baseDateText = lifecycleDateString(baseDate);
    try {
      const employment = await this.assignments.resolveInterval(
        assignment.personId,
        baseDate,
        addLifecycleDays(baseDate, 1),
        assignment.id,
      );
      if (
        employment.organizationUnitId !== rule.organizationUnitId ||
        (conditions.employmentGroupId &&
          employment.term.employmentGroupId !== conditions.employmentGroupId)
      ) {
        return;
      }
      await this.instances.activate(
        rule.authorizedById,
        {
          templateId: rule.templateId,
          personId: assignment.personId,
          assignmentId: assignment.id,
          eventKey: `automation:${rule.id}:${assignment.id}:${baseDateText}`,
          baseDate: baseDateText,
        },
        { automationRuleId: rule.id },
      );
    } catch {
      this.logger.warn('A lifecycle automation candidate could not be activated and will retry.');
    }
  }
}
