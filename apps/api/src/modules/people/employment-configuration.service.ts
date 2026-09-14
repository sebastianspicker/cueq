/** Institutional configuration is versioned and immutable after creation. */
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import { LeaveRuleSchema } from '@cueq/policy';
import {
  CreateEmploymentGroupSchema,
  CreateHolidayCalendarSchema,
  CursorQuerySchema,
} from '@cueq/contracts';
import { z } from 'zod';
import { PrismaService } from '../../persistence/prisma.service.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { AuditHelper } from '../audit/public.js';
import { CapabilityHelper } from './capability.helper.js';

const ConfiguredLeavePolicySchema = LeaveRuleSchema.extend({
  termChanges: z
    .object({
      proration: z.literal('CALENDAR_DAYS'),
      partTimeBasis: z.enum(['WEEKLY_HOURS', 'WORKING_DAYS']),
      rounding: z.literal('TWO_DECIMALS_AT_TOTAL'),
      carryOverPolicyAt: z.enum(['YEAR_START', 'YEAR_END', 'AS_OF']),
    })
    .strict()
    .optional(),
}).strict();

@Injectable()
export class EmploymentConfigurationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CapabilityHelper) private readonly capabilities: CapabilityHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  async list(actorId: string, kind: 'groups' | 'calendars', query: unknown) {
    await this.capabilities.assert(actorId, 'personnel.manage', {});
    const input = parseRequest(CursorQuerySchema, query);
    const args = {
      where: cursorWhere('createdAt', input.cursor),
      orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      take: input.limit + 1,
    };
    if (kind === 'groups') {
      const rows = await this.prisma.employmentGroup.findMany(args);
      return cursorPage(
        rows,
        input.limit,
        'createdAt',
        (r) => r.createdAt,
        (r) => r,
      );
    }
    const rows = await this.prisma.holidayCalendar.findMany(args);
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => r,
    );
  }

  async createGroup(actorId: string, payload: unknown) {
    const input = parseRequest(CreateEmploymentGroupSchema, payload);
    const leavePolicy = parseRequest(ConfiguredLeavePolicySchema, input.leavePolicy);
    return this.prisma.$transaction(async (tx) => {
      await this.capabilities.assert(actorId, 'personnel.manage', {}, tx);
      const group = await tx.employmentGroup.create({
        data: { ...input, leavePolicy: leavePolicy as Prisma.InputJsonValue },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'EMPLOYMENT_GROUP_CREATED',
          entityType: 'EmploymentGroup',
          entityId: group.id,
          after: { code: group.code, version: group.version },
        },
        tx,
      );
      return group;
    });
  }

  async createCalendar(actorId: string, payload: unknown) {
    const input = parseRequest(CreateHolidayCalendarSchema, payload);
    if (
      input.holidayDates.some(
        (date) =>
          !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date,
      )
    )
      throw new BadRequestException('Calendar contains an invalid date.');
    return this.prisma.$transaction(async (tx) => {
      await this.capabilities.assert(actorId, 'personnel.manage', {}, tx);
      const calendar = await tx.holidayCalendar.create({
        data: { ...input, holidayDates: [...new Set(input.holidayDates)].sort() },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'HOLIDAY_CALENDAR_CREATED',
          entityType: 'HolidayCalendar',
          entityId: calendar.id,
          after: { code: calendar.code, version: calendar.version },
        },
        tx,
      );
      return calendar;
    });
  }
}
