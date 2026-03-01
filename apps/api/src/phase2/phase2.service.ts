import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import {
  AbsenceStatus,
  AbsenceType,
  BookingSource,
  ClosingLockSource,
  ClosingStatus,
  OutboxStatus,
  Role,
  TimeTypeCategory,
  WorkflowStatus,
  WorkflowType,
} from '@cueq/database';
import {
  applyCutoffLock,
  buildAuditEntry,
  calculateAbsenceWorkingDays,
  calculateLeaveLedger,
  calculateProratedMonthlyTarget,
  evaluatePlanVsActualCoverage,
  evaluateTimeRules as evaluateTimeRulesCore,
  evaluateOnCallRestCompliance,
  generateClosingChecklist,
} from '@cueq/core';
import {
  DEFAULT_LEAVE_RULE,
  getActivePolicyBundle,
  getPolicyHistory,
  type PolicyRuleType,
} from '@cueq/policy';
import {
  AuditSummaryQuerySchema,
  BookingCorrectionSchema,
  ClosingBookingCorrectionSchema,
  ClosingExportRequestSchema,
  ClosingPeriodMonthQuerySchema,
  ClosingCompletionQuerySchema,
  ComplianceSummaryQuerySchema,
  CreateAbsenceSchema,
  CreateBookingSchema,
  CreateLeaveAdjustmentSchema,
  CreateOnCallDeploymentSchema,
  CreateOnCallRotationSchema,
  CreateRosterSchema,
  CreateShiftSchema,
  CreateWebhookEndpointSchema,
  DeliveryQuerySchema,
  ListOnCallDeploymentsQuerySchema,
  ListOnCallRotationsQuerySchema,
  LeaveAdjustmentQuerySchema,
  OeOvertimeQuerySchema,
  CustomReportPreviewQuerySchema,
  OutboxQuerySchema,
  PolicyBundleQuerySchema,
  PolicyHistoryQuerySchema,
  TeamAbsenceQuerySchema,
  TeamCalendarQuerySchema,
  TimeRuleEvaluationRequestSchema,
  ShiftSwapRequestSchema,
  OvertimeApprovalRequestSchema,
  UpdateShiftSchema,
  UpdateOnCallRotationSchema,
  WorkflowDecisionCommandSchema,
  WorkflowInboxQuerySchema,
  WorkflowPolicyUpsertSchema,
  WorkflowTypeSchema,
  CustomReportOptionsSchema,
  CreateWorkflowDelegationRuleSchema,
  UpdateWorkflowDelegationRuleSchema,
  AssignShiftSchema,
} from '@cueq/shared';
import { PrismaService } from '../persistence/prisma.service';
import type { AuthenticatedIdentity } from '../common/auth/auth.types';
import { assertWebhookDispatchTargetUrl, assertWebhookTargetUrl } from '../common/http/webhook-url';
import { readResponseBodyWithLimit } from '../common/http/read-response-body';
import { TerminalGatewayService } from './terminal-gateway.service';
import { WorkflowRuntimeService } from './workflow-runtime.service';

const HR_LIKE_ROLES = new Set<Role>([Role.HR, Role.ADMIN]);
const EXPORT_DOWNLOAD_ROLES = new Set<Role>([Role.HR, Role.ADMIN, Role.PAYROLL]);
const APPROVAL_ROLES = new Set<Role>([Role.TEAM_LEAD, Role.SHIFT_PLANNER, Role.HR, Role.ADMIN]);
const CLOSING_READ_ROLES = new Set<Role>([Role.TEAM_LEAD, Role.HR, Role.ADMIN]);
const REPORT_ALLOWED_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.HR,
  Role.ADMIN,
  Role.DATA_PROTECTION,
  Role.WORKS_COUNCIL,
]);
const SENSITIVE_REPORT_ALLOWED_ROLES = new Set<Role>([
  Role.HR,
  Role.ADMIN,
  Role.DATA_PROTECTION,
  Role.WORKS_COUNCIL,
]);
const TIME_ENGINE_ALLOWED_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.SHIFT_PLANNER,
  Role.HR,
  Role.ADMIN,
]);
const ABSENCE_TYPES_WITH_APPROVAL = new Set<AbsenceType>([
  AbsenceType.ANNUAL_LEAVE,
  AbsenceType.SPECIAL_LEAVE,
  AbsenceType.TRAINING,
  AbsenceType.TRAVEL,
  AbsenceType.COMP_TIME,
  AbsenceType.FLEX_DAY,
  AbsenceType.UNPAID,
]);
const ABSENCE_TYPES_AUTO_APPROVED = new Set<AbsenceType>([AbsenceType.SICK, AbsenceType.PARENTAL]);
const HOLIDAY_FIXTURE_PATHS = [
  resolve(__dirname, '../../../../fixtures/calendars'),
  resolve(process.cwd(), 'fixtures/calendars'),
  resolve(process.cwd(), '../../fixtures/calendars'),
];
const WEBHOOK_RESPONSE_BODY_MAX_CHARS = 8_000;
const WEBHOOK_ERROR_MAX_CHARS = 1_000;

type ClosingActorRole = 'EMPLOYEE' | 'TEAM_LEAD' | 'HR' | 'ADMIN';
type CoreClosingStatus = 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';

function parseShortOffsetToMinutes(offset: string): number {
  if (offset === 'GMT' || offset === 'UTC') {
    return 0;
  }

  const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(offset);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? '0');
  const minutes = Number(match[3] ?? '0');
  return sign * (hours * 60 + minutes);
}

function toClosingActorRole(role: Role): ClosingActorRole {
  if (role === Role.HR) {
    return 'HR';
  }

  if (role === Role.ADMIN) {
    return 'ADMIN';
  }

  if (role === Role.TEAM_LEAD) {
    return 'TEAM_LEAD';
  }

  return 'EMPLOYEE';
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function truncateForStorage(value: string | null, maxChars: number): string | null {
  if (value === null) {
    return null;
  }
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...[truncated]`;
}

function toCoreClosingStatus(status: ClosingStatus): CoreClosingStatus {
  if (status === ClosingStatus.CLOSED) {
    return 'APPROVED';
  }

  return status;
}

function toPersistenceClosingStatus(status: CoreClosingStatus): ClosingStatus {
  if (status === 'APPROVED') {
    return ClosingStatus.CLOSED;
  }

  if (status === 'OPEN') {
    return ClosingStatus.OPEN;
  }

  if (status === 'REVIEW') {
    return ClosingStatus.REVIEW;
  }

  return ClosingStatus.EXPORTED;
}

@Injectable()
export class Phase2Service {
  private readonly holidayCache = new Map<number, Set<string>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(TerminalGatewayService) private readonly terminalGatewayService: TerminalGatewayService,
    @Inject(WorkflowRuntimeService) private readonly workflowRuntimeService: WorkflowRuntimeService,
  ) {}

  private async personForUser(user: AuthenticatedIdentity) {
    const personBySubject = await this.prisma.person.findFirst({
      where: {
        OR: [{ id: user.subject }, { externalId: user.subject }],
      },
      include: { workTimeModel: true },
    });

    if (personBySubject) {
      if (personBySubject.email.toLowerCase() !== user.email.toLowerCase()) {
        const personByEmail = await this.prisma.person.findUnique({
          where: { email: user.email },
          select: { id: true },
        });
        if (personByEmail && personByEmail.id !== personBySubject.id) {
          throw new ForbiddenException('Authenticated claims do not match person identity.');
        }
      }

      return personBySubject;
    }

    const person = await this.prisma.person.findUnique({
      where: { email: user.email },
      include: { workTimeModel: true },
    });

    if (!person) {
      throw new NotFoundException('Authenticated person was not found.');
    }

    return person;
  }

  private assertCanActForPerson(
    user: AuthenticatedIdentity,
    actorPersonId: string,
    targetPersonId: string,
  ) {
    if (targetPersonId === actorPersonId) {
      return;
    }

    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Cross-person action is restricted to HR/Admin roles.');
    }
  }

  private async appendAudit(input: {
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.JsonValue;
    after?: Prisma.JsonValue;
    reason?: string;
  }) {
    const draft = buildAuditEntry({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before,
      after: input.after,
      reason: input.reason,
    });

    await this.prisma.auditEntry.create({
      data: {
        id: draft.id,
        timestamp: new Date(draft.timestamp),
        actorId: draft.actorId,
        action: draft.action,
        entityType: draft.entityType,
        entityId: draft.entityId,
        before: draft.before as Prisma.InputJsonValue,
        after: draft.after as Prisma.InputJsonValue,
        reason: draft.reason ?? undefined,
      },
    });
  }

  private minGroupSize(): number {
    const parsed = Number(process.env.REPORT_MIN_GROUP_SIZE ?? '5');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 5;
  }

  private webhookBatchSize(): number {
    const parsed = Number(process.env.WEBHOOK_DISPATCH_BATCH_SIZE ?? '50');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 50;
  }

  private webhookMaxAttempts(): number {
    const parsed = Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? '5');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 5;
  }

  private webhookTimeoutMs(): number {
    const parsed = Number(process.env.WEBHOOK_REQUEST_TIMEOUT_MS ?? '5000');
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 5000;
  }

  private closingAutoCutoffEnabled(): boolean {
    const raw = (process.env.CLOSING_AUTO_CUTOFF_ENABLED ?? 'true').trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(raw);
  }

  private allowManualReviewStart(): boolean {
    const raw = (process.env.CLOSING_ALLOW_MANUAL_REVIEW_START ?? 'false').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }

  private closingCutoffDay(): number {
    const parsed = Number(process.env.CLOSING_CUTOFF_DAY ?? '3');
    if (!Number.isFinite(parsed)) {
      return 3;
    }

    return Math.min(28, Math.max(1, Math.trunc(parsed)));
  }

  private closingCutoffHour(): number {
    const parsed = Number(process.env.CLOSING_CUTOFF_HOUR ?? '12');
    if (!Number.isFinite(parsed)) {
      return 12;
    }

    return Math.min(23, Math.max(0, Math.trunc(parsed)));
  }

  private closingTimeZone(): string {
    const candidate = process.env.CLOSING_TIMEZONE?.trim() || 'Europe/Berlin';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch {
      return 'Europe/Berlin';
    }
  }

  private closingBookingGapMinutes(): number {
    const parsed = Number(process.env.CLOSING_BOOKING_GAP_MINUTES ?? '240');
    return Number.isFinite(parsed) && parsed >= 30 ? Math.trunc(parsed) : 240;
  }

  private closingBalanceAnomalyHours(): number {
    const parsed = Number(process.env.CLOSING_BALANCE_ANOMALY_HOURS ?? '40');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 40;
  }

  private resolveTimeZoneOffsetMinutes(at: Date, timeZone: string): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const zonePart = formatter.formatToParts(at).find((part) => part.type === 'timeZoneName');
    return parseShortOffsetToMinutes(zonePart?.value ?? 'UTC');
  }

  private zonedDateTimeToUtcDate(input: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    timeZone: string;
  }): Date {
    const utcGuess = new Date(
      Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0, 0),
    );
    const offsetMinutes = this.resolveTimeZoneOffsetMinutes(utcGuess, input.timeZone);
    return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
  }

  private cutoffAtForPeriod(period: { periodEnd: Date }): Date {
    const cutoffDay = this.closingCutoffDay();
    const cutoffHour = this.closingCutoffHour();
    const timeZone = this.closingTimeZone();

    const periodYear = period.periodEnd.getUTCFullYear();
    const periodMonth = period.periodEnd.getUTCMonth() + 1;
    let cutoffYear = periodYear;
    let cutoffMonth = periodMonth + 1;
    if (cutoffMonth > 12) {
      cutoffMonth = 1;
      cutoffYear += 1;
    }

    const maxDay = new Date(Date.UTC(cutoffYear, cutoffMonth, 0)).getUTCDate();
    const day = Math.min(cutoffDay, maxDay);

    return this.zonedDateTimeToUtcDate({
      year: cutoffYear,
      month: cutoffMonth,
      day,
      hour: cutoffHour,
      minute: 0,
      timeZone,
    });
  }

  private async resolveSystemActorId(): Promise<string | null> {
    const actor = await this.prisma.person.findFirst({
      where: { role: { in: [Role.ADMIN, Role.HR] } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    return actor?.id ?? null;
  }

  async runClosingCutoff(now: Date = new Date()) {
    if (!this.closingAutoCutoffEnabled()) {
      return {
        enabled: false,
        evaluated: 0,
        transitioned: 0,
      };
    }

    const periods = await this.prisma.closingPeriod.findMany({
      where: { status: ClosingStatus.OPEN },
      select: { id: true, periodStart: true, periodEnd: true, organizationUnitId: true },
      orderBy: { periodStart: 'asc' },
    });

    const actorId = await this.resolveSystemActorId();
    let transitioned = 0;

    for (const period of periods) {
      const cutoffAt = this.cutoffAtForPeriod(period);
      if (now < cutoffAt) {
        continue;
      }

      const updated = await this.prisma.closingPeriod.updateMany({
        where: {
          id: period.id,
          status: ClosingStatus.OPEN,
        },
        data: {
          status: ClosingStatus.REVIEW,
          lockedAt: now,
          lockSource: ClosingLockSource.AUTO_CUTOFF,
        },
      });

      if (updated.count === 0) {
        continue;
      }

      transitioned += 1;

      if (actorId) {
        await this.appendAudit({
          actorId,
          action: 'CLOSING_CUTOFF_APPLIED',
          entityType: 'ClosingPeriod',
          entityId: period.id,
          before: { status: 'OPEN' },
          after: {
            status: 'REVIEW',
            lockedAt: now.toISOString(),
            lockSource: 'AUTO_CUTOFF',
            cutoffAt: cutoffAt.toISOString(),
          },
        });
      }
    }

    return {
      enabled: true,
      evaluated: periods.length,
      transitioned,
    };
  }

  private async findOverlappingLockedClosingPeriod(input: {
    organizationUnitId: string | null;
    from: Date;
    to: Date;
  }) {
    const where: Prisma.ClosingPeriodWhereInput = {
      periodStart: { lte: input.to },
      periodEnd: { gte: input.from },
      status: {
        in: [ClosingStatus.REVIEW, ClosingStatus.CLOSED, ClosingStatus.EXPORTED],
      },
      ...(input.organizationUnitId
        ? {
            OR: [
              { organizationUnitId: input.organizationUnitId },
              { organizationUnitId: null },
            ] as Prisma.ClosingPeriodWhereInput[],
          }
        : { organizationUnitId: null }),
    };

    return this.prisma.closingPeriod.findFirst({
      where,
      orderBy: { periodStart: 'desc' },
    });
  }

  private async assertClosingPeriodUnlockedForRange(input: {
    actorId: string;
    organizationUnitId: string | null;
    from: Date;
    to: Date;
    attemptedAction: string;
    entityType: string;
    entityId: string;
  }) {
    const period = await this.findOverlappingLockedClosingPeriod({
      organizationUnitId: input.organizationUnitId,
      from: input.from,
      to: input.to,
    });

    if (!period) {
      return;
    }

    await this.appendAudit({
      actorId: input.actorId,
      action: 'CLOSING_LOCK_BLOCKED',
      entityType: input.entityType,
      entityId: input.entityId,
      before: {
        attemptedAction: input.attemptedAction,
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        organizationUnitId: input.organizationUnitId,
      },
      after: {
        closingPeriodId: period.id,
        status: toCoreClosingStatus(period.status),
        periodStart: period.periodStart.toISOString(),
        periodEnd: period.periodEnd.toISOString(),
        lockedAt: period.lockedAt?.toISOString() ?? null,
        lockSource: period.lockSource ?? null,
      },
    });

    throw new ConflictException({
      code: 'CLOSING_PERIOD_LOCKED',
      message: 'Requested mutation overlaps with a locked closing period.',
      closingPeriodId: period.id,
      status: toCoreClosingStatus(period.status),
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      lockSource: period.lockSource ?? null,
    });
  }

  private assertCanReadReports(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit report access.');
    }
  }

  private assertCanReadSensitiveReports(user: AuthenticatedIdentity) {
    if (!SENSITIVE_REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit sensitive report access.');
    }
  }

  private assertHrLikeRole(user: AuthenticatedIdentity) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can perform this action.');
    }
  }

  private loadHolidayDates(year: number): Set<string> {
    const cached = this.holidayCache.get(year);
    if (cached) {
      return cached;
    }

    for (const basePath of HOLIDAY_FIXTURE_PATHS) {
      const filePath = resolve(basePath, `nrw-holidays-${year}.json`);
      try {
        const raw = readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw) as {
          holidays?: Array<{ date?: string }>;
        };
        const dates = new Set(
          (parsed.holidays ?? []).map((entry) => entry.date).filter(Boolean) as string[],
        );
        this.holidayCache.set(year, dates);
        return dates;
      } catch {
        // try next lookup location
      }
    }

    const empty = new Set<string>();
    this.holidayCache.set(year, empty);
    return empty;
  }

  private holidayDatesBetween(start: string, end: string): string[] {
    const startDate = new Date(`${start}T00:00:00.000Z`);
    const endDate = new Date(`${end}T00:00:00.000Z`);
    const holidays = new Set<string>();

    for (let year = startDate.getUTCFullYear(); year <= endDate.getUTCFullYear(); year += 1) {
      for (const holiday of this.loadHolidayDates(year)) {
        holidays.add(holiday);
      }
    }

    return [...holidays];
  }

  private defaultAsOfDate(targetYear: number): string {
    const today = new Date();
    const currentYear = today.getUTCFullYear();
    if (targetYear === currentYear) {
      return today.toISOString().slice(0, 10);
    }

    return `${targetYear}-12-31`;
  }

  private computeLeaveEntitlementCarryOver(input: {
    year: number;
    workTimeModelWeeklyHours: number;
    employmentStartDate?: string;
    employmentEndDate?: string;
    usage: Array<{ date: string; days: number }>;
    adjustments: Array<{ year: number; deltaDays: number }>;
    priorYearCarryOverDays?: number;
    asOfDate: string;
  }) {
    return calculateLeaveLedger({
      year: input.year,
      asOfDate: input.asOfDate,
      workTimeModelWeeklyHours: input.workTimeModelWeeklyHours,
      employmentStartDate: input.employmentStartDate,
      employmentEndDate: input.employmentEndDate,
      priorYearCarryOverDays: input.priorYearCarryOverDays ?? 0,
      annualLeaveUsage: input.usage,
      adjustments: input.adjustments,
    });
  }

  private assertCanWriteRoster(
    user: AuthenticatedIdentity,
    actorOrganizationUnitId: string,
    rosterOrganizationUnitId: string,
  ) {
    if (user.role !== Role.SHIFT_PLANNER) {
      throw new ForbiddenException('Only shift planners can modify rosters.');
    }

    if (actorOrganizationUnitId !== rosterOrganizationUnitId) {
      throw new ForbiddenException('Shift planners can only modify rosters in their own unit.');
    }
  }

  private assertCanReadRoster(
    user: AuthenticatedIdentity,
    actorOrganizationUnitId: string,
    rosterOrganizationUnitId: string,
  ) {
    if (HR_LIKE_ROLES.has(user.role)) {
      return;
    }

    if (actorOrganizationUnitId !== rosterOrganizationUnitId) {
      throw new ForbiddenException('Roster access is limited to the same organization unit.');
    }
  }

  private assertRosterIsDraft(status: string) {
    if (status !== 'DRAFT') {
      throw new BadRequestException('Roster is not editable unless status is DRAFT.');
    }
  }

  private assertShiftInsideRoster(
    roster: { periodStart: Date; periodEnd: Date },
    start: Date,
    end: Date,
  ) {
    if (start >= end) {
      throw new BadRequestException('Shift startTime must be before endTime.');
    }

    if (start < roster.periodStart || end > roster.periodEnd) {
      throw new BadRequestException('Shift interval must be inside roster period.');
    }
  }

  private assignedPersonIdsForShift(shift: {
    personId: string | null;
    assignments: Array<{ personId: string }>;
  }) {
    const assignmentIds = shift.assignments.map((assignment) => assignment.personId);
    if (shift.personId && !assignmentIds.includes(shift.personId)) {
      assignmentIds.push(shift.personId);
    }
    return assignmentIds;
  }

  private async ensureNoOverlappingAssignedShift(
    personId: string,
    startTime: Date,
    endTime: Date,
    excludeShiftId?: string,
  ) {
    const conflicting = await this.prisma.shiftAssignment.findFirst({
      where: {
        personId,
        shift: {
          id: excludeShiftId ? { not: excludeShiftId } : undefined,
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      },
      include: {
        shift: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
          },
        },
      },
    });

    if (!conflicting) {
      return;
    }

    throw new BadRequestException({
      message: 'Person already has an overlapping assigned shift.',
      conflict: {
        shiftId: conflicting.shift.id,
        startTime: conflicting.shift.startTime.toISOString(),
        endTime: conflicting.shift.endTime.toISOString(),
      },
    });
  }

  private async buildPlanVsActualForRoster(roster: {
    id: string;
    organizationUnitId: string;
    periodStart: Date;
    periodEnd: Date;
    shifts: Array<{
      id: string;
      personId: string | null;
      startTime: Date;
      endTime: Date;
      shiftType: string;
      minStaffing: number;
      assignments: Array<{ personId: string }>;
    }>;
  }) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        person: { organizationUnitId: roster.organizationUnitId },
        timeType: {
          category: {
            in: [TimeTypeCategory.WORK, TimeTypeCategory.DEPLOYMENT],
          },
        },
        startTime: { lt: roster.periodEnd },
        OR: [
          {
            endTime: { gt: roster.periodStart },
          },
          {
            endTime: null,
            startTime: { gte: roster.periodStart },
          },
        ],
      },
      select: {
        personId: true,
        startTime: true,
        endTime: true,
        timeType: {
          select: {
            category: true,
          },
        },
      },
    });

    return evaluatePlanVsActualCoverage(
      roster.shifts.map((shift) => ({
        shiftId: shift.id,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
        assignedPersonIds: this.assignedPersonIdsForShift(shift),
      })),
      bookings.map((booking) => ({
        personId: booking.personId,
        startTime: booking.startTime.toISOString(),
        endTime: (booking.endTime ?? booking.startTime).toISOString(),
        timeTypeCategory: booking.timeType.category,
      })),
    );
  }

  private async toRosterDetail(roster: {
    id: string;
    organizationUnitId: string;
    periodStart: Date;
    periodEnd: Date;
    status: string;
    publishedAt: Date | null;
    shifts: Array<{
      id: string;
      rosterId: string;
      personId: string | null;
      startTime: Date;
      endTime: Date;
      shiftType: string;
      minStaffing: number;
      assignments: Array<{
        id: string;
        personId: string;
        person: { firstName: string; lastName: string };
      }>;
    }>;
  }) {
    const members = await this.prisma.person.findMany({
      where: {
        organizationUnitId: roster.organizationUnitId,
        role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
      },
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });

    return {
      id: roster.id,
      organizationUnitId: roster.organizationUnitId,
      periodStart: roster.periodStart.toISOString(),
      periodEnd: roster.periodEnd.toISOString(),
      status: roster.status,
      publishedAt: roster.publishedAt?.toISOString() ?? null,
      shifts: roster.shifts.map((shift) => ({
        id: shift.id,
        rosterId: shift.rosterId,
        personId: shift.personId,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
        assignments: shift.assignments.map((assignment) => ({
          id: assignment.id,
          personId: assignment.personId,
          firstName: assignment.person.firstName,
          lastName: assignment.person.lastName,
        })),
      })),
      members,
    };
  }

  private async enqueueDomainEvent(input: {
    eventType: 'booking.created' | 'closing.completed' | 'export.ready' | 'violation.detected';
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  }) {
    return this.prisma.domainEventOutbox.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload as Prisma.InputJsonValue,
        status: OutboxStatus.PENDING,
        attempts: 0,
      },
    });
  }

  private parseMonthToRange(month: string) {
    const [yearString, monthString] = month.split('-');
    const year = Number(yearString);
    const monthNumber = Number(monthString);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(monthNumber) ||
      monthNumber < 1 ||
      monthNumber > 12
    ) {
      throw new BadRequestException('Month must be in YYYY-MM format.');
    }

    const from = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59));
    return { from, to };
  }

  async me(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);

    return {
      id: person.id,
      email: person.email,
      role: person.role,
      organizationUnitId: person.organizationUnitId,
      firstName: person.firstName,
      lastName: person.lastName,
    };
  }

  async dashboard(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);
    const now = new Date();
    const dayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const dayEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );

    const [latestTimeAccount, todayBookingsCount, totalBookingsCount, clockInType] =
      await Promise.all([
        this.prisma.timeAccount.findFirst({
          where: { personId: person.id },
          orderBy: { periodStart: 'desc' },
        }),
        this.prisma.booking.count({
          where: {
            personId: person.id,
            startTime: { gte: dayStart, lte: dayEnd },
          },
        }),
        this.prisma.booking.count({
          where: { personId: person.id },
        }),
        this.prisma.timeType.findFirst({
          where: { code: 'WORK' },
          select: { id: true },
        }),
      ]);

    const dailyTarget = Number(
      person.workTimeModel?.dailyTargetHours ?? Number(person.workTimeModel?.weeklyHours ?? 0) / 5,
    );
    const hasFirstBooking = totalBookingsCount > 0;

    return {
      personId: person.id,
      modelName: person.workTimeModel?.name ?? 'N/A',
      todayTargetHours: Number(dailyTarget.toFixed(2)),
      currentBalanceHours: Number((latestTimeAccount?.balance ?? 0).toFixed(2)),
      todayBookingsCount,
      hasFirstBooking,
      showOrientation: !hasFirstBooking,
      clockInTimeTypeId: clockInType?.id ?? null,
      period: latestTimeAccount
        ? {
            start: latestTimeAccount.periodStart.toISOString(),
            end: latestTimeAccount.periodEnd.toISOString(),
          }
        : null,
      quickActions: ['CLOCK_IN', 'REQUEST_LEAVE'],
      now: now.toISOString(),
    };
  }

  async listMyBookings(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);

    const bookings = await this.prisma.booking.findMany({
      where: { personId: person.id },
      include: { timeType: true },
      orderBy: { startTime: 'asc' },
    });

    return bookings.map((booking) => ({
      id: booking.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: booking.timeType.code,
      timeTypeCategory: booking.timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? null,
      source: booking.source,
      note: booking.note,
      shiftId: booking.shiftId,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    }));
  }

  async createBooking(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsed = CreateBookingSchema.parse(payload);

    this.assertCanActForPerson(user, actor.id, parsed.personId);

    if (parsed.source === BookingSource.CORRECTION) {
      throw new BadRequestException(
        'Use POST /v1/closing-periods/{id}/corrections/bookings for controlled correction entries.',
      );
    }
    if (parsed.source === BookingSource.IMPORT || parsed.source === BookingSource.TERMINAL) {
      throw new BadRequestException(
        'Booking source IMPORT/TERMINAL is reserved for integration ingestion paths.',
      );
    }

    const targetPerson = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: { id: true, organizationUnitId: true },
    });
    if (!targetPerson) {
      throw new NotFoundException('Person not found.');
    }

    const startTime = new Date(parsed.startTime);
    const endTime = parsed.endTime ? new Date(parsed.endTime) : startTime;
    const from = startTime <= endTime ? startTime : endTime;
    const to = startTime <= endTime ? endTime : startTime;

    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: targetPerson.organizationUnitId,
      from,
      to,
      attemptedAction: 'BOOKING_CREATE',
      entityType: 'Booking',
      entityId: `${parsed.personId}:${parsed.startTime}`,
    });

    const booking = await this.prisma.booking.create({
      data: {
        personId: parsed.personId,
        timeTypeId: parsed.timeTypeId,
        startTime,
        endTime: parsed.endTime ? endTime : null,
        source: parsed.source as BookingSource,
        note: parsed.note,
        shiftId: parsed.shiftId,
      },
      include: {
        timeType: true,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: booking.id,
      after: {
        personId: booking.personId,
        timeTypeId: booking.timeTypeId,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime?.toISOString() ?? null,
        source: booking.source,
      },
    });

    await this.enqueueDomainEvent({
      eventType: 'booking.created',
      aggregateType: 'Booking',
      aggregateId: booking.id,
      payload: {
        personId: booking.personId,
        timeTypeCode: booking.timeType.code,
        source: booking.source,
      },
    });

    return {
      id: booking.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: booking.timeType.code,
      timeTypeCategory: booking.timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? null,
      source: booking.source,
      note: booking.note,
      shiftId: booking.shiftId,
      createdAt: booking.createdAt.toISOString(),
      updatedAt: booking.updatedAt.toISOString(),
    };
  }

  async createAbsence(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsed = CreateAbsenceSchema.parse(payload);

    this.assertCanActForPerson(user, actor.id, parsed.personId);

    const targetPerson = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: {
        id: true,
        organizationUnitId: true,
        supervisorId: true,
      },
    });
    if (!targetPerson) {
      throw new NotFoundException('Person not found.');
    }

    const start = new Date(`${parsed.startDate}T00:00:00.000Z`);
    const end = new Date(`${parsed.endDate}T00:00:00.000Z`);
    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: targetPerson.organizationUnitId,
      from: start,
      to: end,
      attemptedAction: 'ABSENCE_CREATE',
      entityType: 'Absence',
      entityId: `${parsed.personId}:${parsed.startDate}:${parsed.endDate}`,
    });

    const holidayDates = this.holidayDatesBetween(parsed.startDate, parsed.endDate);
    const daySpan = calculateAbsenceWorkingDays({
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      holidayDates,
    });
    if (daySpan <= 0) {
      throw new BadRequestException('Absence range has no applicable working days.');
    }

    const requestedType = parsed.type as AbsenceType;
    const status = ABSENCE_TYPES_AUTO_APPROVED.has(requestedType)
      ? AbsenceStatus.APPROVED
      : AbsenceStatus.REQUESTED;

    const absence = await this.prisma.absence.create({
      data: {
        personId: parsed.personId,
        type: parsed.type,
        startDate: start,
        endDate: end,
        days: daySpan,
        status,
        note: parsed.note,
      },
    });

    if (status === AbsenceStatus.REQUESTED && ABSENCE_TYPES_WITH_APPROVAL.has(requestedType)) {
      const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
        type: WorkflowType.LEAVE_REQUEST,
        requesterId: targetPerson.id,
        requesterOrganizationUnitId: targetPerson.organizationUnitId,
        preferredApproverId: targetPerson.supervisorId ?? undefined,
      });

      const workflow = await this.prisma.workflowInstance.create({
        data: {
          type: WorkflowType.LEAVE_REQUEST,
          status: assignment.status,
          requesterId: targetPerson.id,
          approverId: assignment.approverId,
          entityType: 'Absence',
          entityId: absence.id,
          reason: parsed.note,
          requestPayload: {
            type: parsed.type,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
          },
          submittedAt: assignment.submittedAt,
          dueAt: assignment.dueAt,
          escalationLevel: assignment.escalationLevel,
          delegationTrail: assignment.delegationTrail,
        },
      });

      await this.appendAudit({
        actorId: actor.id,
        action: 'WORKFLOW_CREATED',
        entityType: 'WorkflowInstance',
        entityId: workflow.id,
        after: {
          type: workflow.type,
          status: workflow.status,
          approverId: workflow.approverId,
          entityType: workflow.entityType,
          entityId: workflow.entityId,
          dueAt: workflow.dueAt?.toISOString() ?? null,
          traversedApprovers: assignment.traversedApprovers,
        },
        reason: parsed.note,
      });
    }

    await this.appendAudit({
      actorId: actor.id,
      action: status === AbsenceStatus.REQUESTED ? 'ABSENCE_REQUESTED' : 'ABSENCE_RECORDED',
      entityType: 'Absence',
      entityId: absence.id,
      after: {
        personId: absence.personId,
        type: absence.type,
        startDate: absence.startDate.toISOString(),
        endDate: absence.endDate.toISOString(),
        status: absence.status,
      },
    });

    return absence;
  }

  async listMyAbsences(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);

    return this.prisma.absence.findMany({
      where: { personId: person.id },
      orderBy: { startDate: 'asc' },
    });
  }

  async cancelAbsence(user: AuthenticatedIdentity, absenceId: string) {
    const actor = await this.personForUser(user);
    const absence = await this.prisma.absence.findUnique({
      where: { id: absenceId },
    });
    if (!absence) {
      throw new NotFoundException('Absence not found.');
    }

    this.assertCanActForPerson(user, actor.id, absence.personId);

    const targetPerson = await this.prisma.person.findUnique({
      where: { id: absence.personId },
      select: { organizationUnitId: true },
    });
    if (!targetPerson) {
      throw new NotFoundException('Person not found.');
    }

    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: targetPerson.organizationUnitId,
      from: absence.startDate,
      to: absence.endDate,
      attemptedAction: 'ABSENCE_CANCEL',
      entityType: 'Absence',
      entityId: absence.id,
    });

    if (absence.status !== AbsenceStatus.REQUESTED && absence.status !== AbsenceStatus.APPROVED) {
      throw new BadRequestException('Only requested or approved absences can be cancelled.');
    }

    const updated = await this.prisma.absence.update({
      where: { id: absence.id },
      data: { status: AbsenceStatus.CANCELLED },
    });

    await this.prisma.workflowInstance.updateMany({
      where: {
        type: WorkflowType.LEAVE_REQUEST,
        entityType: 'Absence',
        entityId: absence.id,
        status: {
          in: [WorkflowStatus.SUBMITTED, WorkflowStatus.PENDING, WorkflowStatus.ESCALATED],
        },
      },
      data: {
        status: WorkflowStatus.CANCELLED,
        approverId: actor.id,
        decisionReason: 'absence cancelled by requester',
        decidedAt: new Date(),
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'ABSENCE_CANCELLED',
      entityType: 'Absence',
      entityId: absence.id,
      before: { status: absence.status },
      after: { status: updated.status },
    });

    return updated;
  }

  async leaveBalance(user: AuthenticatedIdentity, year?: number, asOfDate?: string) {
    const person = await this.personForUser(user);
    const targetYear = year ?? new Date().getUTCFullYear();
    const resolvedAsOfDate = asOfDate ?? this.defaultAsOfDate(targetYear);
    const asOf = new Date(`${resolvedAsOfDate}T00:00:00.000Z`);
    if (Number.isNaN(asOf.getTime())) {
      throw new BadRequestException('Invalid asOfDate.');
    }
    if (asOf.getUTCFullYear() !== targetYear) {
      throw new BadRequestException('asOfDate must be within the requested year.');
    }

    const from = new Date(Date.UTC(targetYear, 0, 1));
    const to = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59));
    const previousYear = targetYear - 1;
    const previousFrom = new Date(Date.UTC(previousYear, 0, 1));
    const previousTo = new Date(Date.UTC(previousYear, 11, 31, 23, 59, 59));

    const [annualLeaveAbsences, priorAnnualLeaveAbsences, adjustments] = await Promise.all([
      this.prisma.absence.findMany({
        where: {
          personId: person.id,
          status: AbsenceStatus.APPROVED,
          type: AbsenceType.ANNUAL_LEAVE,
          startDate: { gte: from },
          endDate: { lte: to },
        },
        orderBy: { endDate: 'asc' },
      }),
      this.prisma.absence.findMany({
        where: {
          personId: person.id,
          status: AbsenceStatus.APPROVED,
          type: AbsenceType.ANNUAL_LEAVE,
          startDate: { gte: previousFrom },
          endDate: { lte: previousTo },
        },
        orderBy: { endDate: 'asc' },
      }),
      this.prisma.leaveAdjustment.findMany({
        where: {
          personId: person.id,
          year: { in: [previousYear, targetYear] },
        },
      }),
    ]);

    const modelWeeklyHours = Number(
      person.workTimeModel?.weeklyHours ?? DEFAULT_LEAVE_RULE.fullTimeWeeklyHours ?? 39.83,
    );
    const employmentStartDate = person.employmentStartDate?.toISOString().slice(0, 10);
    const employmentEndDate = person.employmentEndDate?.toISOString().slice(0, 10);
    const priorYearLedger = this.computeLeaveEntitlementCarryOver({
      year: previousYear,
      asOfDate: `${previousYear}-12-31`,
      workTimeModelWeeklyHours: modelWeeklyHours,
      employmentStartDate,
      employmentEndDate,
      usage: priorAnnualLeaveAbsences.map((absence) => ({
        date: absence.endDate.toISOString().slice(0, 10),
        days: Number(absence.days),
      })),
      adjustments: adjustments.map((entry) => ({
        year: entry.year,
        deltaDays: Number(entry.deltaDays),
      })),
      priorYearCarryOverDays: 0,
    });
    const priorYearCarryOverDays = Math.max(priorYearLedger.remainingDays, 0);

    const calculation = this.computeLeaveEntitlementCarryOver({
      year: targetYear,
      asOfDate: resolvedAsOfDate,
      workTimeModelWeeklyHours: modelWeeklyHours,
      employmentStartDate,
      employmentEndDate,
      usage: annualLeaveAbsences.map((absence) => ({
        date: absence.endDate.toISOString().slice(0, 10),
        days: Number(absence.days),
      })),
      adjustments: adjustments.map((entry) => ({
        year: entry.year,
        deltaDays: Number(entry.deltaDays),
      })),
      priorYearCarryOverDays,
    });

    return {
      personId: person.id,
      year: targetYear,
      asOfDate: resolvedAsOfDate,
      entitlement: calculation.entitlementDays,
      used: calculation.usedDays,
      remaining: calculation.remainingDays,
      carriedOver: calculation.carriedOverDays,
      carriedOverUsed: calculation.carriedOverUsedDays,
      forfeited: calculation.forfeitedDays,
      adjustments: calculation.adjustmentsDays,
    };
  }

  async createLeaveAdjustment(user: AuthenticatedIdentity, payload: unknown) {
    this.assertHrLikeRole(user);
    const actor = await this.personForUser(user);
    const parsed = CreateLeaveAdjustmentSchema.parse(payload);

    const person = await this.prisma.person.findUnique({ where: { id: parsed.personId } });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: person.organizationUnitId,
      from: new Date(Date.UTC(parsed.year, 11, 1, 0, 0, 0)),
      to: new Date(Date.UTC(parsed.year, 11, 31, 23, 59, 59)),
      attemptedAction: 'LEAVE_ADJUSTMENT_CREATE',
      entityType: 'LeaveAdjustment',
      entityId: `${parsed.personId}:${parsed.year}`,
    });

    const adjustment = await this.prisma.leaveAdjustment.create({
      data: {
        personId: parsed.personId,
        year: parsed.year,
        deltaDays: parsed.deltaDays,
        reason: parsed.reason,
        createdBy: actor.id,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'LEAVE_ADJUSTMENT_CREATED',
      entityType: 'LeaveAdjustment',
      entityId: adjustment.id,
      after: {
        personId: adjustment.personId,
        year: adjustment.year,
        deltaDays: Number(adjustment.deltaDays),
      },
      reason: adjustment.reason,
    });

    return {
      ...adjustment,
      deltaDays: Number(adjustment.deltaDays),
    };
  }

  async listLeaveAdjustments(user: AuthenticatedIdentity, query: unknown) {
    this.assertHrLikeRole(user);
    const parsed = LeaveAdjustmentQuerySchema.parse(query ?? {});

    const adjustments = await this.prisma.leaveAdjustment.findMany({
      where: {
        personId: parsed.personId,
        year: parsed.year,
      },
      orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    });

    return adjustments.map((adjustment) => ({
      ...adjustment,
      deltaDays: Number(adjustment.deltaDays),
    }));
  }

  async teamCalendar(user: AuthenticatedIdentity, start?: string, end?: string) {
    const person = await this.personForUser(user);
    const query = TeamCalendarQuerySchema.parse({ start, end });
    const today = new Date();
    const startDate = query.start
      ? new Date(query.start.includes('T') ? query.start : `${query.start}T00:00:00.000Z`)
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0, 0));
    const endDate = query.end
      ? new Date(query.end.includes('T') ? query.end : `${query.end}T23:59:59.999Z`)
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid start or end date.');
    }
    if (startDate > endDate) {
      throw new BadRequestException('start must be on or before end.');
    }

    const includePending = user.role === Role.TEAM_LEAD || HR_LIKE_ROLES.has(user.role);
    const visibleStatuses = includePending
      ? [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED]
      : [AbsenceStatus.APPROVED];
    const absences = await this.prisma.absence.findMany({
      where: {
        person: { organizationUnitId: person.organizationUnitId },
        status: { in: visibleStatuses },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      include: { person: true },
      orderBy: { startDate: 'asc' },
    });

    const maySeeReason = user.role === Role.TEAM_LEAD || HR_LIKE_ROLES.has(user.role);

    return absences.map((absence) => ({
      id: absence.id,
      personId: absence.personId,
      personName: `${absence.person.firstName} ${absence.person.lastName}`,
      startDate: absence.startDate.toISOString().slice(0, 10),
      endDate: absence.endDate.toISOString().slice(0, 10),
      status: absence.status,
      visibilityStatus: 'ABSENT' as const,
      type: maySeeReason ? absence.type : undefined,
      note: maySeeReason ? absence.note : undefined,
    }));
  }

  async createBookingCorrection(user: AuthenticatedIdentity, payload: unknown) {
    const requester = await this.personForUser(user);
    const parsed = BookingCorrectionSchema.parse(payload);

    const booking = await this.prisma.booking.findUnique({
      where: { id: parsed.bookingId },
      include: {
        person: {
          select: {
            id: true,
            organizationUnitId: true,
            supervisorId: true,
          },
        },
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found.');
    }

    this.assertCanActForPerson(user, requester.id, booking.personId);
    const preferredApproverId =
      booking.personId === requester.id
        ? (booking.person.supervisorId ?? requester.supervisorId ?? undefined)
        : undefined;

    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.BOOKING_CORRECTION,
      requesterId: requester.id,
      requesterOrganizationUnitId: booking.person.organizationUnitId,
      preferredApproverId,
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.BOOKING_CORRECTION,
        status: assignment.status,
        requesterId: requester.id,
        approverId: assignment.approverId,
        entityType: 'Booking',
        entityId: booking.id,
        reason: parsed.reason,
        requestPayload: {
          bookingId: parsed.bookingId,
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          timeTypeId: parsed.timeTypeId,
        },
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.appendAudit({
      actorId: requester.id,
      action: 'WORKFLOW_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        type: workflow.type,
        status: workflow.status,
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
        traversedApprovers: assignment.traversedApprovers,
      },
      reason: parsed.reason,
    });

    return {
      ...workflow,
      escalated: assignment.escalated,
      traversedApprovers: assignment.traversedApprovers,
    };
  }

  async createShiftSwapWorkflow(user: AuthenticatedIdentity, payload: unknown) {
    const requester = await this.personForUser(user);
    const parsed = ShiftSwapRequestSchema.parse(payload);
    this.assertCanActForPerson(user, requester.id, parsed.fromPersonId);

    const shift = await this.prisma.shift.findUnique({
      where: { id: parsed.shiftId },
      include: {
        assignments: true,
        roster: {
          select: {
            organizationUnitId: true,
          },
        },
      },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    const toPerson = await this.prisma.person.findUnique({
      where: { id: parsed.toPersonId },
      select: { id: true, organizationUnitId: true },
    });
    if (!toPerson) {
      throw new NotFoundException('toPersonId person not found.');
    }
    if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException(
        'toPersonId must belong to the shift roster organization unit.',
      );
    }

    const fromAssignment = shift.assignments.find(
      (assignment) => assignment.personId === parsed.fromPersonId,
    );
    if (!fromAssignment) {
      throw new BadRequestException('fromPersonId is not assigned to the shift.');
    }
    if (shift.assignments.some((assignment) => assignment.personId === parsed.toPersonId)) {
      throw new BadRequestException('toPersonId is already assigned to the shift.');
    }

    const preferredApprover = await this.prisma.person.findFirst({
      where: {
        role: Role.SHIFT_PLANNER,
        organizationUnitId: shift.roster.organizationUnitId,
      },
      select: { id: true },
    });
    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.SHIFT_SWAP,
      requesterId: requester.id,
      requesterOrganizationUnitId: shift.roster.organizationUnitId,
      preferredApproverId: preferredApprover?.id ?? undefined,
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.SHIFT_SWAP,
        status: assignment.status,
        requesterId: requester.id,
        approverId: assignment.approverId,
        entityType: 'Shift',
        entityId: shift.id,
        reason: parsed.reason,
        requestPayload: parsed,
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.appendAudit({
      actorId: requester.id,
      action: 'WORKFLOW_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        type: workflow.type,
        status: workflow.status,
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
        shiftId: shift.id,
        fromPersonId: parsed.fromPersonId,
        toPersonId: parsed.toPersonId,
      },
      reason: parsed.reason,
    });

    return workflow;
  }

  async createOvertimeApprovalWorkflow(user: AuthenticatedIdentity, payload: unknown) {
    const requester = await this.personForUser(user);
    const parsed = OvertimeApprovalRequestSchema.parse(payload);
    this.assertCanActForPerson(user, requester.id, parsed.personId);

    const start = new Date(parsed.periodStart);
    const end = new Date(parsed.periodEnd);
    if (start > end) {
      throw new BadRequestException('periodStart must be on or before periodEnd.');
    }

    const targetPerson = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: {
        id: true,
        organizationUnitId: true,
        supervisorId: true,
      },
    });
    if (!targetPerson) {
      throw new NotFoundException('Person not found.');
    }

    const matchingAccount = await this.prisma.timeAccount.findFirst({
      where: {
        personId: parsed.personId,
        periodStart: { lte: start },
        periodEnd: { gte: end },
      },
      select: { id: true },
      orderBy: { periodStart: 'desc' },
    });
    if (!matchingAccount) {
      throw new BadRequestException(
        'No matching time account exists for the requested overtime approval period.',
      );
    }

    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.OVERTIME_APPROVAL,
      requesterId: requester.id,
      requesterOrganizationUnitId: targetPerson.organizationUnitId,
      preferredApproverId: targetPerson.supervisorId ?? undefined,
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.OVERTIME_APPROVAL,
        status: assignment.status,
        requesterId: requester.id,
        approverId: assignment.approverId,
        entityType: 'TimeAccount',
        entityId: targetPerson.id,
        reason: parsed.reason,
        requestPayload: parsed,
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.appendAudit({
      actorId: requester.id,
      action: 'WORKFLOW_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        type: workflow.type,
        status: workflow.status,
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
        personId: parsed.personId,
        overtimeHours: parsed.overtimeHours,
      },
      reason: parsed.reason,
    });

    return workflow;
  }

  async workflowInbox(user: AuthenticatedIdentity, query?: unknown) {
    const person = await this.personForUser(user);
    const parsed = WorkflowInboxQuerySchema.parse(query ?? {});

    return this.workflowRuntimeService.listInbox(
      {
        id: person.id,
        role: user.role,
        organizationUnitId: person.organizationUnitId,
      },
      parsed,
    );
  }

  async workflowDetail(user: AuthenticatedIdentity, workflowId: string) {
    const person = await this.personForUser(user);
    return this.workflowRuntimeService.getDetail(
      {
        id: person.id,
        role: user.role,
        organizationUnitId: person.organizationUnitId,
      },
      workflowId,
    );
  }

  async listWorkflowPolicies(user: AuthenticatedIdentity) {
    this.assertHrLikeRole(user);
    return this.workflowRuntimeService.listPolicies();
  }

  async upsertWorkflowPolicy(user: AuthenticatedIdentity, type: string, payload: unknown) {
    this.assertHrLikeRole(user);
    const parsedType = WorkflowTypeSchema.parse(type);
    const parsedPayload = WorkflowPolicyUpsertSchema.parse(payload);
    return this.workflowRuntimeService.upsertPolicy(parsedType as WorkflowType, parsedPayload);
  }

  async listWorkflowDelegations(
    user: AuthenticatedIdentity,
    query: { delegatorId?: string; workflowType?: string },
  ) {
    this.assertHrLikeRole(user);
    const workflowType = query.workflowType
      ? (WorkflowTypeSchema.parse(query.workflowType) as WorkflowType)
      : undefined;
    return this.workflowRuntimeService.listDelegations({
      delegatorId: query.delegatorId,
      workflowType,
    });
  }

  async createWorkflowDelegation(user: AuthenticatedIdentity, payload: unknown) {
    this.assertHrLikeRole(user);
    const actor = await this.personForUser(user);
    const parsed = CreateWorkflowDelegationRuleSchema.parse(payload);
    return this.workflowRuntimeService.createDelegation(actor.id, {
      delegatorId: parsed.delegatorId,
      delegateId: parsed.delegateId,
      workflowType: parsed.workflowType as WorkflowType | undefined,
      organizationUnitId: parsed.organizationUnitId,
      activeFrom: parsed.activeFrom,
      activeTo: parsed.activeTo,
      isActive: parsed.isActive,
      priority: parsed.priority,
    });
  }

  async updateWorkflowDelegation(user: AuthenticatedIdentity, id: string, payload: unknown) {
    this.assertHrLikeRole(user);
    const actor = await this.personForUser(user);
    const parsed = UpdateWorkflowDelegationRuleSchema.parse(payload);
    return this.workflowRuntimeService.updateDelegation(actor.id, id, {
      delegateId: parsed.delegateId,
      workflowType: parsed.workflowType as WorkflowType | null | undefined,
      organizationUnitId: parsed.organizationUnitId,
      activeFrom: parsed.activeFrom,
      activeTo: parsed.activeTo,
      isActive: parsed.isActive,
      priority: parsed.priority,
    });
  }

  async deleteWorkflowDelegation(user: AuthenticatedIdentity, id: string) {
    this.assertHrLikeRole(user);
    const actor = await this.personForUser(user);
    await this.workflowRuntimeService.deleteDelegation(actor.id, id);
    return { deleted: true, id };
  }

  async decideWorkflow(user: AuthenticatedIdentity, workflowId: string, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsed = WorkflowDecisionCommandSchema.parse({
      ...(payload as Record<string, unknown>),
      workflowId,
    });
    const requestedAction = this.workflowRuntimeService.normalizeAction(parsed);

    if (requestedAction === 'APPROVE') {
      const workflowForPrecheck = await this.prisma.workflowInstance.findUnique({
        where: { id: workflowId },
        select: {
          id: true,
          type: true,
          entityType: true,
          entityId: true,
          requestPayload: true,
        },
      });
      if (!workflowForPrecheck) {
        throw new NotFoundException('Workflow not found.');
      }

      if (
        workflowForPrecheck.type === WorkflowType.SHIFT_SWAP &&
        workflowForPrecheck.entityType === 'Shift'
      ) {
        const requestPayload = ShiftSwapRequestSchema.parse(
          workflowForPrecheck.requestPayload ?? {},
        );
        const shiftId = requestPayload.shiftId || workflowForPrecheck.entityId;
        const shift = await this.prisma.shift.findUnique({
          where: { id: shiftId },
          include: {
            assignments: true,
            roster: {
              select: {
                organizationUnitId: true,
              },
            },
          },
        });
        if (!shift) {
          throw new NotFoundException('Shift not found for approved swap.');
        }

        const toPerson = await this.prisma.person.findUnique({
          where: { id: requestPayload.toPersonId },
          select: { id: true, organizationUnitId: true },
        });
        if (!toPerson) {
          throw new NotFoundException('toPersonId person no longer exists.');
        }
        if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
          throw new BadRequestException(
            'toPersonId must belong to the shift roster organization unit.',
          );
        }

        const fromAssigned = shift.assignments.some(
          (assignment) => assignment.personId === requestPayload.fromPersonId,
        );
        if (!fromAssigned) {
          throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
        }

        const toAssigned = shift.assignments.some(
          (assignment) => assignment.personId === requestPayload.toPersonId,
        );
        if (toAssigned) {
          throw new BadRequestException('toPersonId assignment already exists on shift.');
        }
      }

      if (
        workflowForPrecheck.type === WorkflowType.OVERTIME_APPROVAL &&
        workflowForPrecheck.entityType === 'TimeAccount'
      ) {
        const requestPayload = OvertimeApprovalRequestSchema.parse(
          workflowForPrecheck.requestPayload ?? {},
        );
        const periodStart = new Date(requestPayload.periodStart);
        const periodEnd = new Date(requestPayload.periodEnd);
        const account = await this.prisma.timeAccount.findFirst({
          where: {
            personId: requestPayload.personId,
            periodStart: { lte: periodStart },
            periodEnd: { gte: periodEnd },
          },
          select: { id: true },
          orderBy: { periodStart: 'desc' },
        });
        if (!account) {
          throw new BadRequestException('No matching time account found for overtime approval.');
        }
      }
    }

    const decision = await this.workflowRuntimeService.decide(
      {
        id: actor.id,
        role: user.role,
        organizationUnitId: actor.organizationUnitId,
      },
      parsed,
    );

    if (
      decision.updated.type === WorkflowType.LEAVE_REQUEST &&
      decision.updated.entityType === 'Absence'
    ) {
      const nextAbsenceStatus =
        decision.action === 'APPROVE'
          ? AbsenceStatus.APPROVED
          : decision.action === 'REJECT'
            ? AbsenceStatus.REJECTED
            : decision.action === 'CANCEL'
              ? AbsenceStatus.CANCELLED
              : null;

      if (nextAbsenceStatus) {
        const currentAbsence = await this.prisma.absence.findUnique({
          where: { id: decision.updated.entityId },
          select: { status: true },
        });
        const result = await this.prisma.absence.updateMany({
          where: {
            id: decision.updated.entityId,
            status:
              nextAbsenceStatus === AbsenceStatus.CANCELLED
                ? { in: [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED] }
                : AbsenceStatus.REQUESTED,
          },
          data: {
            status: nextAbsenceStatus,
          },
        });

        if (result.count > 0) {
          await this.appendAudit({
            actorId: actor.id,
            action:
              nextAbsenceStatus === AbsenceStatus.APPROVED
                ? 'ABSENCE_APPROVED'
                : nextAbsenceStatus === AbsenceStatus.REJECTED
                  ? 'ABSENCE_REJECTED'
                  : 'ABSENCE_CANCELLED',
            entityType: 'Absence',
            entityId: decision.updated.entityId,
            before: {
              status: currentAbsence?.status ?? null,
            },
            after: {
              status: nextAbsenceStatus,
            },
            reason: parsed.reason,
          });
        }
      }
    }

    if (
      decision.updated.type === WorkflowType.SHIFT_SWAP &&
      decision.updated.entityType === 'Shift' &&
      decision.action === 'APPROVE'
    ) {
      const payload = ShiftSwapRequestSchema.parse(decision.updated.requestPayload ?? {});
      const shiftId = payload.shiftId || decision.updated.entityId;
      await this.prisma.$transaction(async (tx) => {
        const shift = await tx.shift.findUnique({
          where: { id: shiftId },
          include: {
            assignments: true,
            roster: {
              select: {
                organizationUnitId: true,
              },
            },
          },
        });
        if (!shift) {
          throw new NotFoundException('Shift not found for approved swap.');
        }
        const toPerson = await tx.person.findUnique({
          where: { id: payload.toPersonId },
          select: { id: true, organizationUnitId: true },
        });
        if (!toPerson) {
          throw new NotFoundException('toPersonId person no longer exists.');
        }
        if (toPerson.organizationUnitId !== shift.roster.organizationUnitId) {
          throw new BadRequestException(
            'toPersonId must belong to the shift roster organization unit.',
          );
        }
        const fromAssignment = shift.assignments.find(
          (assignment) => assignment.personId === payload.fromPersonId,
        );
        if (!fromAssignment) {
          throw new BadRequestException('fromPersonId assignment no longer exists on shift.');
        }
        const toAssigned = shift.assignments.some(
          (assignment) => assignment.personId === payload.toPersonId,
        );
        if (toAssigned) {
          throw new BadRequestException('toPersonId assignment already exists on shift.');
        }
        await tx.shiftAssignment.delete({ where: { id: fromAssignment.id } });
        await tx.shiftAssignment.create({
          data: {
            shiftId: shift.id,
            personId: payload.toPersonId,
          },
        });
      });

      await this.appendAudit({
        actorId: actor.id,
        action: 'SHIFT_SWAP_APPLIED',
        entityType: 'Shift',
        entityId: decision.updated.entityId,
        after: {
          fromPersonId: payload.fromPersonId,
          toPersonId: payload.toPersonId,
          workflowId: decision.updated.id,
        },
        reason: parsed.reason,
      });
    }

    if (
      decision.updated.type === WorkflowType.OVERTIME_APPROVAL &&
      decision.updated.entityType === 'TimeAccount' &&
      decision.action === 'APPROVE'
    ) {
      const payload = OvertimeApprovalRequestSchema.parse(decision.updated.requestPayload ?? {});
      const periodStart = new Date(payload.periodStart);
      const periodEnd = new Date(payload.periodEnd);

      const account = await this.prisma.timeAccount.findFirst({
        where: {
          personId: payload.personId,
          periodStart: { lte: periodStart },
          periodEnd: { gte: periodEnd },
        },
        orderBy: { periodStart: 'desc' },
      });
      if (!account) {
        throw new NotFoundException('No matching time account found for overtime approval.');
      }

      const nextOvertimeHours =
        Number(Number(account.overtimeHours).toFixed(2)) + payload.overtimeHours;
      const updated = await this.prisma.timeAccount.update({
        where: { id: account.id },
        data: {
          overtimeHours: Number(nextOvertimeHours.toFixed(2)),
        },
      });

      await this.appendAudit({
        actorId: actor.id,
        action: 'OVERTIME_APPROVED',
        entityType: 'TimeAccount',
        entityId: updated.id,
        before: {
          overtimeHours: Number(account.overtimeHours),
        },
        after: {
          overtimeHours: Number(updated.overtimeHours),
          workflowId: decision.updated.id,
        },
        reason: parsed.reason,
      });
    }

    return decision.updated;
  }

  async createRoster(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsed = CreateRosterSchema.parse(payload);

    this.assertCanWriteRoster(user, actor.organizationUnitId, parsed.organizationUnitId);

    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: parsed.organizationUnitId,
      from: new Date(parsed.periodStart),
      to: new Date(parsed.periodEnd),
      attemptedAction: 'ROSTER_CREATE',
      entityType: 'Roster',
      entityId: `${parsed.organizationUnitId}:${parsed.periodStart}`,
    });

    const periodStart = new Date(parsed.periodStart);
    const periodEnd = new Date(parsed.periodEnd);
    const overlap = await this.prisma.roster.findFirst({
      where: {
        organizationUnitId: parsed.organizationUnitId,
        periodStart: { lt: periodEnd },
        periodEnd: { gt: periodStart },
        status: { in: ['DRAFT', 'PUBLISHED'] },
      },
      select: { id: true },
    });

    if (overlap) {
      throw new BadRequestException('A roster already exists for the given overlapping period.');
    }

    const roster = await this.prisma.roster.create({
      data: {
        organizationUnitId: parsed.organizationUnitId,
        periodStart,
        periodEnd,
        status: 'DRAFT',
      },
      include: {
        shifts: {
          include: {
            assignments: {
              include: {
                person: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'ROSTER_CREATED',
      entityType: 'Roster',
      entityId: roster.id,
      after: {
        organizationUnitId: roster.organizationUnitId,
        periodStart: roster.periodStart.toISOString(),
        periodEnd: roster.periodEnd.toISOString(),
        status: roster.status,
      },
    });

    return this.toRosterDetail(roster);
  }

  async rosterById(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        shifts: {
          include: {
            assignments: {
              include: {
                person: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanReadRoster(user, actor.organizationUnitId, roster.organizationUnitId);

    return this.toRosterDetail(roster);
  }

  async createRosterShift(user: AuthenticatedIdentity, rosterId: string, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsed = CreateShiftSchema.parse(payload);

    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      select: {
        id: true,
        organizationUnitId: true,
        periodStart: true,
        periodEnd: true,
        status: true,
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, roster.organizationUnitId);
    this.assertRosterIsDraft(roster.status);

    const startTime = new Date(parsed.startTime);
    const endTime = new Date(parsed.endTime);
    this.assertShiftInsideRoster(roster, startTime, endTime);
    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: roster.organizationUnitId,
      from: startTime,
      to: endTime,
      attemptedAction: 'SHIFT_CREATE',
      entityType: 'Shift',
      entityId: `${roster.id}:${parsed.startTime}`,
    });

    const shift = await this.prisma.shift.create({
      data: {
        rosterId: roster.id,
        personId: null,
        startTime,
        endTime,
        shiftType: parsed.shiftType,
        minStaffing: parsed.minStaffing,
      },
      include: {
        assignments: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_CREATED',
      entityType: 'Shift',
      entityId: shift.id,
      after: {
        rosterId: shift.rosterId,
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
      },
    });

    return {
      id: shift.id,
      rosterId: shift.rosterId,
      personId: shift.personId,
      startTime: shift.startTime.toISOString(),
      endTime: shift.endTime.toISOString(),
      shiftType: shift.shiftType,
      minStaffing: shift.minStaffing,
      assignments: shift.assignments.map((assignment) => ({
        id: assignment.id,
        personId: assignment.personId,
        firstName: assignment.person.firstName,
        lastName: assignment.person.lastName,
      })),
    };
  }

  async updateRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    payload: unknown,
  ) {
    const actor = await this.personForUser(user);
    const parsed = UpdateShiftSchema.parse(payload);

    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, rosterId },
      include: {
        roster: {
          select: {
            id: true,
            organizationUnitId: true,
            periodStart: true,
            periodEnd: true,
            status: true,
          },
        },
        assignments: true,
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, shift.roster.organizationUnitId);
    this.assertRosterIsDraft(shift.roster.status);

    const nextStartTime = parsed.startTime ? new Date(parsed.startTime) : shift.startTime;
    const nextEndTime = parsed.endTime ? new Date(parsed.endTime) : shift.endTime;
    this.assertShiftInsideRoster(shift.roster, nextStartTime, nextEndTime);
    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: shift.roster.organizationUnitId,
      from: nextStartTime,
      to: nextEndTime,
      attemptedAction: 'SHIFT_UPDATE',
      entityType: 'Shift',
      entityId: shift.id,
    });

    for (const assignment of shift.assignments) {
      await this.ensureNoOverlappingAssignedShift(
        assignment.personId,
        nextStartTime,
        nextEndTime,
        shift.id,
      );
    }

    const updated = await this.prisma.shift.update({
      where: { id: shift.id },
      data: {
        startTime: parsed.startTime ? new Date(parsed.startTime) : undefined,
        endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
        shiftType: parsed.shiftType,
        minStaffing: parsed.minStaffing,
      },
      include: {
        assignments: {
          include: {
            person: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_UPDATED',
      entityType: 'Shift',
      entityId: updated.id,
      before: {
        startTime: shift.startTime.toISOString(),
        endTime: shift.endTime.toISOString(),
        shiftType: shift.shiftType,
        minStaffing: shift.minStaffing,
      },
      after: {
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        shiftType: updated.shiftType,
        minStaffing: updated.minStaffing,
      },
    });

    return {
      id: updated.id,
      rosterId: updated.rosterId,
      personId: updated.personId,
      startTime: updated.startTime.toISOString(),
      endTime: updated.endTime.toISOString(),
      shiftType: updated.shiftType,
      minStaffing: updated.minStaffing,
      assignments: updated.assignments.map((assignment) => ({
        id: assignment.id,
        personId: assignment.personId,
        firstName: assignment.person.firstName,
        lastName: assignment.person.lastName,
      })),
    };
  }

  async deleteRosterShift(user: AuthenticatedIdentity, rosterId: string, shiftId: string) {
    const actor = await this.personForUser(user);

    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, rosterId },
      include: {
        roster: {
          select: { organizationUnitId: true, status: true },
        },
        _count: {
          select: { bookings: true },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, shift.roster.organizationUnitId);
    this.assertRosterIsDraft(shift.roster.status);
    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: shift.roster.organizationUnitId,
      from: shift.startTime,
      to: shift.endTime,
      attemptedAction: 'SHIFT_DELETE',
      entityType: 'Shift',
      entityId: shift.id,
    });

    if (shift._count.bookings > 0) {
      throw new BadRequestException('Cannot delete shift with existing bookings.');
    }

    await this.prisma.shiftAssignment.deleteMany({
      where: { shiftId: shift.id },
    });

    await this.prisma.shift.delete({
      where: { id: shift.id },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_DELETED',
      entityType: 'Shift',
      entityId: shift.id,
      before: {
        rosterId,
      },
    });

    return {
      deleted: true,
      shiftId: shift.id,
    };
  }

  async assignRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    payload: unknown,
  ) {
    const actor = await this.personForUser(user);
    const parsed = AssignShiftSchema.parse(payload);

    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, rosterId },
      include: {
        roster: {
          select: {
            organizationUnitId: true,
            status: true,
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, shift.roster.organizationUnitId);
    this.assertRosterIsDraft(shift.roster.status);
    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: shift.roster.organizationUnitId,
      from: shift.startTime,
      to: shift.endTime,
      attemptedAction: 'SHIFT_ASSIGN',
      entityType: 'Shift',
      entityId: shift.id,
    });

    const person = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        organizationUnitId: true,
      },
    });

    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    if (person.organizationUnitId !== shift.roster.organizationUnitId) {
      throw new BadRequestException('Assigned person must belong to the roster organization unit.');
    }

    await this.ensureNoOverlappingAssignedShift(
      parsed.personId,
      shift.startTime,
      shift.endTime,
      shift.id,
    );

    const exists = await this.prisma.shiftAssignment.findFirst({
      where: {
        shiftId: shift.id,
        personId: parsed.personId,
      },
      select: { id: true },
    });

    if (exists) {
      throw new BadRequestException('Person is already assigned to this shift.');
    }

    const assignment = await this.prisma.shiftAssignment.create({
      data: {
        shiftId: shift.id,
        personId: parsed.personId,
      },
    });

    if (!shift.personId) {
      await this.prisma.shift.update({
        where: { id: shift.id },
        data: { personId: parsed.personId },
      });
    }

    await this.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_ASSIGNED',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
      after: {
        shiftId: assignment.shiftId,
        personId: assignment.personId,
      },
    });

    return {
      id: assignment.id,
      shiftId: assignment.shiftId,
      personId: assignment.personId,
      firstName: person.firstName,
      lastName: person.lastName,
      createdAt: assignment.createdAt.toISOString(),
      updatedAt: assignment.updatedAt.toISOString(),
    };
  }

  async unassignRosterShift(
    user: AuthenticatedIdentity,
    rosterId: string,
    shiftId: string,
    assignmentId: string,
  ) {
    const actor = await this.personForUser(user);
    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: {
        id: assignmentId,
        shiftId,
        shift: { rosterId },
      },
      include: {
        shift: {
          select: {
            id: true,
            personId: true,
            startTime: true,
            endTime: true,
            roster: {
              select: {
                organizationUnitId: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Shift assignment not found.');
    }

    this.assertCanWriteRoster(
      user,
      actor.organizationUnitId,
      assignment.shift.roster.organizationUnitId,
    );
    this.assertRosterIsDraft(assignment.shift.roster.status);
    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: assignment.shift.roster.organizationUnitId,
      from: assignment.shift.startTime,
      to: assignment.shift.endTime,
      attemptedAction: 'SHIFT_UNASSIGN',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
    });

    await this.prisma.shiftAssignment.delete({
      where: { id: assignment.id },
    });

    if (assignment.shift.personId === assignment.personId) {
      const replacement = await this.prisma.shiftAssignment.findFirst({
        where: { shiftId: assignment.shift.id },
        orderBy: { createdAt: 'asc' },
        select: { personId: true },
      });

      await this.prisma.shift.update({
        where: { id: assignment.shift.id },
        data: {
          personId: replacement?.personId ?? null,
        },
      });
    }

    await this.appendAudit({
      actorId: actor.id,
      action: 'SHIFT_UNASSIGNED',
      entityType: 'ShiftAssignment',
      entityId: assignment.id,
      before: {
        shiftId: assignment.shiftId,
        personId: assignment.personId,
      },
    });

    return {
      deleted: true,
      assignmentId,
    };
  }

  async publishRoster(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        shifts: {
          include: {
            assignments: {
              select: { personId: true },
            },
          },
        },
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanWriteRoster(user, actor.organizationUnitId, roster.organizationUnitId);
    this.assertRosterIsDraft(roster.status);
    await this.assertClosingPeriodUnlockedForRange({
      actorId: actor.id,
      organizationUnitId: roster.organizationUnitId,
      from: roster.periodStart,
      to: roster.periodEnd,
      attemptedAction: 'ROSTER_PUBLISH',
      entityType: 'Roster',
      entityId: roster.id,
    });

    const shortfalls = roster.shifts
      .map((shift) => {
        const assigned = this.assignedPersonIdsForShift(shift).length;
        const shortfall = Math.max(shift.minStaffing - assigned, 0);
        return {
          shiftId: shift.id,
          required: shift.minStaffing,
          assigned,
          shortfall,
        };
      })
      .filter((entry) => entry.shortfall > 0);

    if (shortfalls.length > 0) {
      throw new BadRequestException({
        message: 'Cannot publish roster due to staffing shortfalls.',
        shortfalls,
      });
    }

    const updated = await this.prisma.roster.update({
      where: { id: roster.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'ROSTER_PUBLISHED',
      entityType: 'Roster',
      entityId: updated.id,
      before: {
        status: roster.status,
      },
      after: {
        status: updated.status,
        publishedAt: updated.publishedAt?.toISOString() ?? null,
      },
    });

    return {
      id: updated.id,
      status: updated.status,
      publishedAt: updated.publishedAt?.toISOString() ?? null,
    };
  }

  async currentRoster(user: AuthenticatedIdentity) {
    const person = await this.personForUser(user);
    const now = new Date();

    const roster = await this.prisma.roster.findFirst({
      where: {
        organizationUnitId: person.organizationUnitId,
        status: 'PUBLISHED',
        periodStart: { lte: now },
        periodEnd: { gte: now },
      },
      include: {
        shifts: {
          include: {
            assignments: {
              include: {
                person: {
                  select: {
                    firstName: true,
                    lastName: true,
                  },
                },
              },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!roster) {
      throw new NotFoundException('No current roster found for this organization unit.');
    }

    return this.toRosterDetail(roster);
  }

  async rosterPlanVsActual(user: AuthenticatedIdentity, rosterId: string) {
    const actor = await this.personForUser(user);
    const roster = await this.prisma.roster.findUnique({
      where: { id: rosterId },
      include: {
        shifts: {
          include: {
            assignments: {
              select: { personId: true },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found.');
    }

    this.assertCanReadRoster(user, actor.organizationUnitId, roster.organizationUnitId);

    const result = await this.buildPlanVsActualForRoster(roster);

    return {
      rosterId: roster.id,
      periodStart: roster.periodStart.toISOString(),
      periodEnd: roster.periodEnd.toISOString(),
      ...result,
    };
  }

  async createOnCallRotation(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role)) {
      throw new ForbiddenException('Only approval-capable roles can manage on-call rotations.');
    }

    const parsedPayload = CreateOnCallRotationSchema.safeParse(payload);
    if (!parsedPayload.success) {
      throw new BadRequestException(
        parsedPayload.error.issues.map((issue) => issue.message).join('; '),
      );
    }
    const parsed = parsedPayload.data;
    if (
      (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) &&
      parsed.organizationUnitId !== actor.organizationUnitId
    ) {
      throw new ForbiddenException(
        'Team leads and shift planners can only create rotations in their own unit.',
      );
    }

    const person = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: { id: true, organizationUnitId: true },
    });
    if (!person) {
      throw new NotFoundException('Person for on-call rotation was not found.');
    }
    if (person.organizationUnitId !== parsed.organizationUnitId) {
      throw new BadRequestException(
        'On-call rotation organizationUnitId must match the person organization unit.',
      );
    }

    const rotation = await this.prisma.onCallRotation.create({
      data: {
        personId: parsed.personId,
        organizationUnitId: parsed.organizationUnitId,
        startTime: new Date(parsed.startTime),
        endTime: new Date(parsed.endTime),
        rotationType: parsed.rotationType,
        note: parsed.note,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'ONCALL_ROTATION_CREATED',
      entityType: 'OnCallRotation',
      entityId: rotation.id,
      after: {
        personId: rotation.personId,
        organizationUnitId: rotation.organizationUnitId,
        startTime: rotation.startTime.toISOString(),
        endTime: rotation.endTime.toISOString(),
        rotationType: rotation.rotationType,
      },
    });

    return rotation;
  }

  async listOnCallRotations(user: AuthenticatedIdentity, query: unknown) {
    const actor = await this.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Role does not permit reading rotations.');
    }

    const parsed = ListOnCallRotationsQuerySchema.parse(query ?? {});
    const fromDate = parsed.from ? new Date(parsed.from) : null;
    const toDate = parsed.to ? new Date(parsed.to) : null;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must be on or before to.');
    }
    const where: Prisma.OnCallRotationWhereInput = {
      personId: parsed.personId,
      organizationUnitId: parsed.organizationUnitId,
    };
    if (fromDate && toDate) {
      where.AND = [{ startTime: { lte: toDate } }, { endTime: { gte: fromDate } }];
    } else if (fromDate) {
      where.endTime = { gte: fromDate };
    } else if (toDate) {
      where.startTime = { lte: toDate };
    }

    if (user.role === Role.EMPLOYEE) {
      where.personId = actor.id;
    } else if (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) {
      where.organizationUnitId = actor.organizationUnitId;
    }

    return this.prisma.onCallRotation.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });
  }

  async listOnCallDeployments(user: AuthenticatedIdentity, query: unknown) {
    const actor = await this.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role) && user.role !== Role.EMPLOYEE) {
      throw new ForbiddenException('Role does not permit reading deployments.');
    }

    const parsed = ListOnCallDeploymentsQuerySchema.parse(query ?? {});
    const fromDate = parsed.from ? new Date(parsed.from) : null;
    const toDate = parsed.to ? new Date(parsed.to) : null;
    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('from must be on or before to.');
    }
    const where: Prisma.OnCallDeploymentWhereInput = {
      personId: parsed.personId,
      rotation: parsed.organizationUnitId
        ? { organizationUnitId: parsed.organizationUnitId }
        : undefined,
    };
    if (fromDate && toDate) {
      where.AND = [{ startTime: { lte: toDate } }, { endTime: { gte: fromDate } }];
    } else if (fromDate) {
      where.endTime = { gte: fromDate };
    } else if (toDate) {
      where.startTime = { lte: toDate };
    }

    if (user.role === Role.EMPLOYEE) {
      where.personId = actor.id;
    } else if (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) {
      where.rotation = { organizationUnitId: actor.organizationUnitId };
    }

    const deployments = await this.prisma.onCallDeployment.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });

    return deployments.map((deployment) => ({
      id: deployment.id,
      personId: deployment.personId,
      rotationId: deployment.rotationId,
      startTime: deployment.startTime.toISOString(),
      endTime: deployment.endTime.toISOString(),
      remote: deployment.remote,
      ticketReference: deployment.ticketReference,
      eventReference: deployment.eventReference,
      description: deployment.description,
    }));
  }

  async updateOnCallRotation(user: AuthenticatedIdentity, rotationId: string, payload: unknown) {
    const actor = await this.personForUser(user);
    if (!APPROVAL_ROLES.has(user.role)) {
      throw new ForbiddenException('Only approval-capable roles can update on-call rotations.');
    }

    const existing = await this.prisma.onCallRotation.findUnique({ where: { id: rotationId } });
    if (!existing) {
      throw new NotFoundException('On-call rotation not found.');
    }

    if (
      (user.role === Role.TEAM_LEAD || user.role === Role.SHIFT_PLANNER) &&
      existing.organizationUnitId !== actor.organizationUnitId
    ) {
      throw new ForbiddenException(
        'Team leads and shift planners can only update rotations in their own unit.',
      );
    }

    const parsed = UpdateOnCallRotationSchema.parse(payload);
    const nextStartTime = parsed.startTime ? new Date(parsed.startTime) : existing.startTime;
    const nextEndTime = parsed.endTime ? new Date(parsed.endTime) : existing.endTime;
    if (nextStartTime >= nextEndTime) {
      throw new BadRequestException('startTime must be before endTime.');
    }

    const updated = await this.prisma.onCallRotation.update({
      where: { id: existing.id },
      data: {
        startTime: parsed.startTime ? new Date(parsed.startTime) : undefined,
        endTime: parsed.endTime ? new Date(parsed.endTime) : undefined,
        rotationType: parsed.rotationType,
        note: parsed.note,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'ONCALL_ROTATION_UPDATED',
      entityType: 'OnCallRotation',
      entityId: updated.id,
      before: {
        startTime: existing.startTime.toISOString(),
        endTime: existing.endTime.toISOString(),
        rotationType: existing.rotationType,
      },
      after: {
        startTime: updated.startTime.toISOString(),
        endTime: updated.endTime.toISOString(),
        rotationType: updated.rotationType,
      },
    });

    return updated;
  }

  async createOnCallDeployment(user: AuthenticatedIdentity, payload: unknown) {
    const actor = await this.personForUser(user);
    const parsedPayload = CreateOnCallDeploymentSchema.safeParse(payload);
    if (!parsedPayload.success) {
      throw new BadRequestException(
        parsedPayload.error.issues.map((issue) => issue.message).join('; '),
      );
    }
    const parsed = parsedPayload.data;

    this.assertCanActForPerson(user, actor.id, parsed.personId);

    const rotation = await this.prisma.onCallRotation.findUnique({
      where: { id: parsed.rotationId },
    });
    if (!rotation) {
      throw new BadRequestException('Referenced on-call rotation does not exist.');
    }

    if (rotation.personId !== parsed.personId) {
      throw new BadRequestException('Rotation personId does not match deployment personId.');
    }

    const deploymentStart = new Date(parsed.startTime);
    if (deploymentStart < rotation.startTime || deploymentStart > rotation.endTime) {
      throw new BadRequestException('Deployment start time must be within rotation window.');
    }

    const endTime = parsed.endTime
      ? new Date(parsed.endTime)
      : new Date(new Date(parsed.startTime).getTime() + 60 * 60 * 1000);
    if (endTime <= deploymentStart) {
      throw new BadRequestException('Deployment end time must be after start time.');
    }
    if (endTime > rotation.endTime) {
      throw new BadRequestException('Deployment end time must be within rotation window.');
    }

    const duplicate = await this.prisma.onCallDeployment.findFirst({
      where: {
        personId: parsed.personId,
        rotationId: parsed.rotationId,
        startTime: deploymentStart,
        endTime,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('An identical on-call deployment already exists.');
    }

    const deployment = await this.prisma.onCallDeployment.create({
      data: {
        personId: parsed.personId,
        rotationId: parsed.rotationId,
        startTime: new Date(parsed.startTime),
        endTime,
        remote: parsed.remote,
        ticketReference: parsed.ticketReference,
        eventReference: parsed.eventReference,
        description: parsed.description,
      },
    });

    const deploymentTimeType = await this.prisma.timeType.findFirst({
      where: { code: 'DEPLOYMENT' },
      select: { id: true },
    });

    if (deploymentTimeType) {
      await this.prisma.booking.create({
        data: {
          personId: parsed.personId,
          timeTypeId: deploymentTimeType.id,
          startTime: new Date(parsed.startTime),
          endTime,
          source: BookingSource.MANUAL,
          note: parsed.description,
        },
      });
    }

    await this.appendAudit({
      actorId: actor.id,
      action: 'ONCALL_DEPLOYMENT_CREATED',
      entityType: 'OnCallDeployment',
      entityId: deployment.id,
      after: {
        personId: deployment.personId,
        startTime: deployment.startTime.toISOString(),
        endTime: deployment.endTime.toISOString(),
      },
    });

    return deployment;
  }

  async onCallCompliance(user: AuthenticatedIdentity, personId?: string, nextShiftStart?: string) {
    const actor = await this.personForUser(user);
    const targetPersonId = personId ?? actor.id;

    this.assertCanActForPerson(user, actor.id, targetPersonId);

    if (!nextShiftStart) {
      throw new BadRequestException('nextShiftStart query parameter is required.');
    }

    const shiftStart = new Date(nextShiftStart);
    if (Number.isNaN(shiftStart.getTime())) {
      throw new BadRequestException('nextShiftStart must be a valid ISO datetime.');
    }

    const deployments = await this.prisma.onCallDeployment.findMany({
      where: {
        personId: targetPersonId,
      },
      orderBy: { endTime: 'desc' },
      take: 20,
    });

    const activeRotation = await this.prisma.onCallRotation.findFirst({
      where: {
        personId: targetPersonId,
        startTime: { lte: shiftStart },
        endTime: { gte: shiftStart },
      },
      orderBy: { startTime: 'desc' },
    });

    const result = evaluateOnCallRestCompliance({
      rotationStart:
        activeRotation?.startTime.toISOString() ??
        deployments[deployments.length - 1]?.startTime.toISOString() ??
        nextShiftStart,
      rotationEnd:
        activeRotation?.endTime.toISOString() ??
        deployments[0]?.endTime.toISOString() ??
        nextShiftStart,
      nextShiftStart,
      deployments: deployments.map((deployment) => ({
        start: deployment.startTime.toISOString(),
        end: deployment.endTime.toISOString(),
      })),
    });

    return {
      personId: targetPersonId,
      rotationId: activeRotation?.id ?? null,
      ...result,
    };
  }

  async timeEngineEvaluate(user: AuthenticatedIdentity, payload: unknown) {
    if (!TIME_ENGINE_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit time-engine rule evaluation.');
    }

    const actor = await this.personForUser(user);
    const parsed = TimeRuleEvaluationRequestSchema.parse(payload ?? {});
    const result = evaluateTimeRulesCore(parsed);

    await this.appendAudit({
      actorId: actor.id,
      action: 'TIME_RULES_EVALUATED',
      entityType: 'TimeRuleEvaluation',
      entityId: `${parsed.week}:${new Date().toISOString()}`,
      after: {
        week: parsed.week,
        timezone: parsed.timezone ?? 'Europe/Berlin',
        intervalCount: parsed.intervals.length,
        violations: result.violations.length,
        warnings: result.warnings.length,
        surchargeLines: result.surchargeMinutes,
      },
    });

    return result;
  }

  async listClosingPeriods(
    user: AuthenticatedIdentity,
    fromMonth?: string,
    toMonth?: string,
    organizationUnitId?: string,
  ) {
    const actor = await this.personForUser(user);
    const parsed = ClosingPeriodMonthQuerySchema.parse({
      from: fromMonth,
      to: toMonth,
      organizationUnitId,
    });
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing periods.');
    }

    if (
      user.role === Role.TEAM_LEAD &&
      parsed.organizationUnitId &&
      parsed.organizationUnitId !== actor.organizationUnitId
    ) {
      throw new ForbiddenException('Team leads can only access closing periods in their own unit.');
    }

    const from = parsed.from
      ? this.parseMonthToRange(parsed.from).from
      : new Date('2026-01-01T00:00:00.000Z');
    const to = parsed.to
      ? this.parseMonthToRange(parsed.to).to
      : new Date('2030-12-31T23:59:59.000Z');
    const targetOuId =
      user.role === Role.TEAM_LEAD ? actor.organizationUnitId : parsed.organizationUnitId;

    const periods = await this.prisma.closingPeriod.findMany({
      where: {
        organizationUnitId: targetOuId,
        periodStart: { lte: to },
        periodEnd: { gte: from },
      },
      include: {
        exportRuns: {
          orderBy: { exportedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { periodStart: 'desc' },
    });

    return periods.map((period) => ({
      id: period.id,
      organizationUnitId: period.organizationUnitId,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      status: toCoreClosingStatus(period.status),
      exportRuns: period.exportRuns,
      closedAt: period.closedAt?.toISOString() ?? null,
      closedById: period.closedById,
      leadApprovedAt: period.leadApprovedAt?.toISOString() ?? null,
      leadApprovedById: period.leadApprovedById,
      hrApprovedAt: period.hrApprovedAt?.toISOString() ?? null,
      hrApprovedById: period.hrApprovedById,
      lockedAt: period.lockedAt?.toISOString() ?? null,
      lockSource: period.lockSource,
      createdAt: period.createdAt.toISOString(),
      updatedAt: period.updatedAt.toISOString(),
    }));
  }

  async getClosingPeriod(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personForUser(user);
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing periods.');
    }

    const period = await this.prisma.closingPeriod.findUnique({
      where: { id: closingPeriodId },
      include: { exportRuns: { orderBy: { exportedAt: 'desc' } } },
    });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    if (user.role === Role.TEAM_LEAD && period.organizationUnitId !== actor.organizationUnitId) {
      throw new ForbiddenException('Team leads can only access closing periods in their own unit.');
    }

    return {
      id: period.id,
      organizationUnitId: period.organizationUnitId,
      periodStart: period.periodStart.toISOString(),
      periodEnd: period.periodEnd.toISOString(),
      status: toCoreClosingStatus(period.status),
      exportRuns: period.exportRuns,
      closedAt: period.closedAt?.toISOString() ?? null,
      closedById: period.closedById,
      leadApprovedAt: period.leadApprovedAt?.toISOString() ?? null,
      leadApprovedById: period.leadApprovedById,
      hrApprovedAt: period.hrApprovedAt?.toISOString() ?? null,
      hrApprovedById: period.hrApprovedById,
      lockedAt: period.lockedAt?.toISOString() ?? null,
      lockSource: period.lockSource,
      createdAt: period.createdAt.toISOString(),
      updatedAt: period.updatedAt.toISOString(),
    };
  }

  async startClosingReview(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personForUser(user);
    if (!this.allowManualReviewStart()) {
      throw new ForbiddenException(
        'Manual review start is disabled. Enable CLOSING_ALLOW_MANUAL_REVIEW_START for emergency use.',
      );
    }

    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Manual review start is restricted to ADMIN role.');
    }

    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'ADVANCE_TO_REVIEW',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        lockedAt: new Date(),
        lockSource: ClosingLockSource.MANUAL_REVIEW_START,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_REVIEW_STARTED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        lockSource: updated.lockSource,
        lockedAt: updated.lockedAt?.toISOString() ?? null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async leadApproveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personForUser(user);
    if (user.role !== Role.TEAM_LEAD) {
      throw new ForbiddenException('Only TEAM_LEAD can submit lead approval.');
    }

    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    if (!period.organizationUnitId) {
      throw new BadRequestException('Global closing periods do not require team-lead approval.');
    }
    if (period.organizationUnitId !== actor.organizationUnitId) {
      throw new ForbiddenException(
        'Team leads can only approve closing periods in their own unit.',
      );
    }
    if (period.status !== ClosingStatus.REVIEW) {
      throw new BadRequestException('Lead approval is only valid while period is in REVIEW.');
    }

    if (period.leadApprovedAt) {
      return {
        ...period,
        status: toCoreClosingStatus(period.status),
      };
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        leadApprovedAt: new Date(),
        leadApprovedById: actor.id,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_LEAD_APPROVED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: {
        leadApprovedAt: null,
        leadApprovedById: period.leadApprovedById ?? null,
      },
      after: {
        leadApprovedAt: updated.leadApprovedAt?.toISOString() ?? null,
        leadApprovedById: updated.leadApprovedById ?? null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async reopenClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can reopen closing periods.');
    }

    const actor = await this.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });
    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'REOPEN',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        leadApprovedAt: null,
        leadApprovedById: null,
        hrApprovedAt: null,
        hrApprovedById: null,
        lockedAt: null,
        lockSource: null,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_REOPENED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        leadApprovedAt: null,
        hrApprovedAt: null,
        lockedAt: null,
        lockSource: null,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async closingChecklist(user: AuthenticatedIdentity, closingPeriodId: string) {
    const actor = await this.personForUser(user);
    if (!CLOSING_READ_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit reading closing checklist details.');
    }

    const period = await this.prisma.closingPeriod.findUnique({
      where: { id: closingPeriodId },
      include: {
        exportRuns: true,
      },
    });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }
    if (user.role === Role.TEAM_LEAD && period.organizationUnitId !== actor.organizationUnitId) {
      throw new ForbiddenException(
        'Team leads can only access closing checklist in their own unit.',
      );
    }

    const personScope = await this.prisma.person.findMany({
      where: period.organizationUnitId
        ? {
            organizationUnitId: period.organizationUnitId,
            role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
          }
        : {
            role: { in: [Role.EMPLOYEE, Role.SHIFT_PLANNER] },
          },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const personIds = personScope.map((person) => person.id);
    const gapThresholdMinutes = this.closingBookingGapMinutes();
    const balanceThresholdHours = this.closingBalanceAnomalyHours();

    const [bookings, approvedAbsences] = await Promise.all([
      personIds.length === 0
        ? Promise.resolve([])
        : this.prisma.booking.findMany({
            where: {
              personId: { in: personIds },
              startTime: { lte: period.periodEnd },
              OR: [{ endTime: null }, { endTime: { gte: period.periodStart } }],
            },
            select: {
              personId: true,
              startTime: true,
              endTime: true,
            },
            orderBy: [{ personId: 'asc' }, { startTime: 'asc' }],
          }),
      personIds.length === 0
        ? Promise.resolve([])
        : this.prisma.absence.findMany({
            where: {
              personId: { in: personIds },
              status: AbsenceStatus.APPROVED,
              startDate: { lte: period.periodEnd },
              endDate: { gte: period.periodStart },
            },
            select: { personId: true },
          }),
    ]);

    const coveredPersonIds = new Set([
      ...bookings.map((entry) => entry.personId),
      ...approvedAbsences.map((entry) => entry.personId),
    ]);
    const missingBookings = Math.max(personIds.length - coveredPersonIds.size, 0);

    const bookingsByPerson = new Map<string, Array<{ startTime: Date; endTime: Date | null }>>();
    for (const booking of bookings) {
      if (!bookingsByPerson.has(booking.personId)) {
        bookingsByPerson.set(booking.personId, []);
      }
      bookingsByPerson.get(booking.personId)?.push({
        startTime: booking.startTime,
        endTime: booking.endTime,
      });
    }

    let bookingGaps = 0;
    let ruleViolations = 0;
    for (const entries of bookingsByPerson.values()) {
      for (let index = 0; index < entries.length; index += 1) {
        const current = entries[index];
        if (!current || !current.endTime) {
          continue;
        }

        const durationMinutes = (current.endTime.getTime() - current.startTime.getTime()) / 60000;
        if (durationMinutes > 10 * 60) {
          ruleViolations += 1;
        }

        const previous = index > 0 ? entries[index - 1] : null;
        if (previous?.endTime) {
          const gapMinutes = (current.startTime.getTime() - previous.endTime.getTime()) / 60000;
          if (gapMinutes > gapThresholdMinutes) {
            bookingGaps += 1;
          }
          const previousDay = previous.endTime.toISOString().slice(0, 10);
          const currentDay = current.startTime.toISOString().slice(0, 10);
          if (previousDay !== currentDay && gapMinutes >= 0 && gapMinutes < 11 * 60) {
            ruleViolations += 1;
          }
        }
      }
    }

    const openStatuses = [
      WorkflowStatus.SUBMITTED,
      WorkflowStatus.PENDING,
      WorkflowStatus.ESCALATED,
    ];
    const [openCorrectionRequests, openLeaveRequests] = await Promise.all([
      personIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.workflowInstance.count({
            where: {
              type: WorkflowType.BOOKING_CORRECTION,
              status: { in: openStatuses },
              requesterId: { in: personIds },
              createdAt: { gte: period.periodStart, lte: period.periodEnd },
            },
          }),
      personIds.length === 0
        ? Promise.resolve(0)
        : this.prisma.absence.count({
            where: {
              personId: { in: personIds },
              status: AbsenceStatus.REQUESTED,
              startDate: { lte: period.periodEnd },
              endDate: { gte: period.periodStart },
            },
          }),
    ]);

    const rosters = await this.prisma.roster.findMany({
      where: {
        periodStart: { lte: period.periodEnd },
        periodEnd: { gte: period.periodStart },
        organizationUnitId: period.organizationUnitId ?? undefined,
      },
      include: {
        shifts: {
          include: {
            assignments: {
              select: { personId: true },
            },
          },
        },
      },
    });

    const rosterMismatches = (
      await Promise.all(
        rosters.map(async (roster) => {
          const coverage = await this.buildPlanVsActualForRoster(roster);
          return coverage.mismatchedSlots;
        }),
      )
    ).reduce((sum, mismatches) => sum + mismatches, 0);

    const balanceAnomalies =
      personIds.length === 0
        ? 0
        : await this.prisma.timeAccount.count({
            where: {
              personId: { in: personIds },
              periodStart: { gte: period.periodStart },
              periodEnd: { lte: period.periodEnd },
              OR: [
                { balance: { gt: balanceThresholdHours } },
                { balance: { lt: -balanceThresholdHours } },
              ],
            },
          });

    const checklist = generateClosingChecklist({
      missingBookings,
      bookingGaps,
      openCorrectionRequests,
      openLeaveRequests,
      ruleViolations,
      rosterMismatches,
      balanceAnomalies,
    });

    if (checklist.hasErrors) {
      const openErrors = checklist.items
        .filter((item) => item.severity === 'ERROR' && item.status === 'OPEN')
        .map((item) => item.code);
      if (openErrors.length > 0) {
        await this.enqueueDomainEvent({
          eventType: 'violation.detected',
          aggregateType: 'ClosingPeriod',
          aggregateId: period.id,
          payload: {
            checklistCodes: openErrors,
            periodStart: period.periodStart.toISOString(),
            periodEnd: period.periodEnd.toISOString(),
          },
        });
      }
    }

    return {
      closingPeriodId: period.id,
      status: toCoreClosingStatus(period.status),
      hasErrors: checklist.hasErrors,
      items: checklist.items,
    };
  }

  async approveClosing(user: AuthenticatedIdentity, closingPeriodId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can approve closing periods.');
    }

    const actor = await this.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }
    if (period.organizationUnitId && !period.leadApprovedAt) {
      throw new BadRequestException(
        'Team-lead approval is required before HR can finalize this closing period.',
      );
    }

    const checklist = await this.closingChecklist(user, closingPeriodId);
    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'APPROVE',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: checklist.hasErrors,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const updated = await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        hrApprovedAt: new Date(),
        hrApprovedById: actor.id,
        closedAt: new Date(),
        closedById: actor.id,
        lockedAt: period.lockedAt ?? new Date(),
        lockSource: period.lockSource ?? ClosingLockSource.MANUAL_REVIEW_START,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_APPROVED',
      entityType: 'ClosingPeriod',
      entityId: updated.id,
      before: { status: period.status },
      after: {
        status: updated.status,
        hrApprovedAt: updated.hrApprovedAt?.toISOString() ?? null,
        hrApprovedById: updated.hrApprovedById,
      },
    });

    await this.enqueueDomainEvent({
      eventType: 'closing.completed',
      aggregateType: 'ClosingPeriod',
      aggregateId: updated.id,
      payload: {
        status: toCoreClosingStatus(updated.status),
        organizationUnitId: updated.organizationUnitId,
      },
    });

    return {
      ...updated,
      status: toCoreClosingStatus(updated.status),
    };
  }

  async exportClosing(user: AuthenticatedIdentity, closingPeriodId: string, payload?: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can export closing periods.');
    }
    const parsedRequest = ClosingExportRequestSchema.parse(payload ?? {});
    const format = parsedRequest.format ?? 'CSV_V1';

    const actor = await this.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const accounts = await this.prisma.timeAccount.findMany({
      where: {
        person: period.organizationUnitId
          ? {
              organizationUnitId: period.organizationUnitId,
            }
          : undefined,
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
      },
      orderBy: { personId: 'asc' },
    });

    const normalizedRows = accounts.map((account) => ({
      personId: account.personId,
      targetHours: Number(Number(account.targetHours).toFixed(2)),
      actualHours: Number(Number(account.actualHours).toFixed(2)),
      balance: Number(Number(account.balance).toFixed(2)),
    }));

    const header = 'personId,targetHours,actualHours,balance';
    const body = normalizedRows
      .map(
        (row) =>
          `${row.personId},${row.targetHours.toFixed(2)},${row.actualHours.toFixed(2)},${row.balance.toFixed(2)}`,
      )
      .join('\n');
    const csv = `${header}\n${body}\n`;
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<payrollExport format="${format}" closingPeriodId="${escapeXml(closingPeriodId)}">`,
      ...normalizedRows.map(
        (row) =>
          `  <row personId="${escapeXml(row.personId)}" targetHours="${row.targetHours.toFixed(2)}" actualHours="${row.actualHours.toFixed(2)}" balance="${row.balance.toFixed(2)}" />`,
      ),
      '</payrollExport>',
      '',
    ].join('\n');
    const artifact = format === 'CSV_V1' ? csv : xml;
    const contentType = format === 'CSV_V1' ? 'text/csv' : 'application/xml';
    const checksum = createHash('sha256').update(artifact).digest('hex');

    const existingRun = await this.prisma.exportRun.findFirst({
      where: {
        closingPeriodId,
        format,
        checksum,
      },
      orderBy: { exportedAt: 'desc' },
    });

    if (existingRun?.artifact) {
      return {
        exportRun: existingRun,
        checksum: existingRun.checksum,
        csv: existingRun.format === 'CSV_V1' ? existingRun.artifact : null,
        artifact: existingRun.artifact,
        contentType: existingRun.contentType ?? contentType,
        rows: normalizedRows,
      };
    }

    if (period.status !== ClosingStatus.EXPORTED) {
      const transition = applyCutoffLock({
        currentStatus: toCoreClosingStatus(period.status),
        action: 'EXPORT',
        actorRole: toClosingActorRole(actor.role),
        checklistHasErrors: false,
      });

      if (transition.violations.length > 0) {
        throw new BadRequestException(transition.violations);
      }

      await this.prisma.closingPeriod.update({
        where: { id: closingPeriodId },
        data: {
          status: toPersistenceClosingStatus(transition.nextStatus),
        },
      });
    }

    const exportRun = await this.prisma.exportRun.create({
      data: {
        closingPeriodId,
        format,
        recordCount: normalizedRows.length,
        checksum,
        artifact,
        contentType,
        exportedById: actor.id,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'CLOSING_EXPORTED',
      entityType: 'ExportRun',
      entityId: exportRun.id,
      after: {
        checksum,
        recordCount: exportRun.recordCount,
        format: exportRun.format,
      },
    });

    await this.enqueueDomainEvent({
      eventType: 'export.ready',
      aggregateType: 'ExportRun',
      aggregateId: exportRun.id,
      payload: {
        closingPeriodId,
        format: exportRun.format,
        recordCount: exportRun.recordCount,
        checksum: exportRun.checksum,
      },
    });

    return {
      exportRun,
      checksum,
      csv: format === 'CSV_V1' ? artifact : null,
      artifact,
      contentType,
      rows: normalizedRows,
    };
  }

  async getExportRunCsv(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export CSV.');
    }

    const exportRun = await this.prisma.exportRun.findFirst({
      where: {
        id: runId,
        closingPeriodId,
      },
    });

    if (!exportRun) {
      throw new NotFoundException('Export run not found.');
    }

    if (!exportRun.artifact || exportRun.format !== 'CSV_V1') {
      throw new BadRequestException('CSV artifact is unavailable for this export run.');
    }

    return {
      filename: `payroll-export-${closingPeriodId}-${runId}.csv`,
      csv: exportRun.artifact,
      checksum: exportRun.checksum,
      contentType: exportRun.contentType ?? 'text/csv',
    };
  }

  async getExportRunArtifact(user: AuthenticatedIdentity, closingPeriodId: string, runId: string) {
    if (!EXPORT_DOWNLOAD_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin/Payroll can download payroll export artifacts.');
    }

    const exportRun = await this.prisma.exportRun.findFirst({
      where: {
        id: runId,
        closingPeriodId,
      },
    });
    if (!exportRun) {
      throw new NotFoundException('Export run not found.');
    }
    if (!exportRun.artifact) {
      throw new BadRequestException('Artifact is unavailable for this export run.');
    }

    const extension = exportRun.format === 'XML_V1' ? 'xml' : 'csv';
    const contentType =
      exportRun.contentType ?? (exportRun.format === 'XML_V1' ? 'application/xml' : 'text/csv');

    return {
      filename: `payroll-export-${closingPeriodId}-${runId}.${extension}`,
      artifact: exportRun.artifact,
      checksum: exportRun.checksum,
      contentType,
      format: exportRun.format,
    };
  }

  async postCloseCorrection(user: AuthenticatedIdentity, closingPeriodId: string, reason?: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can create post-close corrections.');
    }

    const actor = await this.personForUser(user);
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }

    const transition = applyCutoffLock({
      currentStatus: toCoreClosingStatus(period.status),
      action: 'POST_CLOSE_CORRECTION',
      actorRole: toClosingActorRole(actor.role),
      checklistHasErrors: false,
    });

    if (transition.violations.length > 0) {
      throw new BadRequestException(transition.violations);
    }

    const assignment = await this.workflowRuntimeService.buildWorkflowAssignment({
      type: WorkflowType.POST_CLOSE_CORRECTION,
      requesterId: actor.id,
      requesterOrganizationUnitId: actor.organizationUnitId,
    });

    const workflow = await this.prisma.workflowInstance.create({
      data: {
        type: WorkflowType.POST_CLOSE_CORRECTION,
        status: assignment.status,
        requesterId: actor.id,
        approverId: assignment.approverId,
        entityType: 'ClosingPeriod',
        entityId: period.id,
        reason,
        requestPayload: {
          closingPeriodId,
        },
        submittedAt: assignment.submittedAt,
        dueAt: assignment.dueAt,
        escalationLevel: assignment.escalationLevel,
        delegationTrail: assignment.delegationTrail,
      },
    });

    await this.prisma.closingPeriod.update({
      where: { id: period.id },
      data: {
        status: toPersistenceClosingStatus(transition.nextStatus),
        hrApprovedAt: null,
        hrApprovedById: null,
        lockedAt: new Date(),
        lockSource: ClosingLockSource.HR_CORRECTION,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'POST_CLOSE_CORRECTION_CREATED',
      entityType: 'WorkflowInstance',
      entityId: workflow.id,
      after: {
        approverId: workflow.approverId,
        dueAt: workflow.dueAt?.toISOString() ?? null,
      },
      reason,
    });

    return workflow;
  }

  async applyPostCloseBookingCorrection(
    user: AuthenticatedIdentity,
    closingPeriodId: string,
    payload: unknown,
  ) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can apply post-close booking corrections.');
    }

    const actor = await this.personForUser(user);
    const parsed = ClosingBookingCorrectionSchema.parse(payload ?? {});
    const period = await this.prisma.closingPeriod.findUnique({ where: { id: closingPeriodId } });

    if (!period) {
      throw new NotFoundException('Closing period not found.');
    }
    if (period.status !== ClosingStatus.REVIEW && period.status !== ClosingStatus.EXPORTED) {
      throw new BadRequestException(
        'Post-close booking corrections require a REVIEW or EXPORTED period.',
      );
    }

    const workflow = await this.prisma.workflowInstance.findUnique({
      where: { id: parsed.workflowId },
    });
    if (!workflow) {
      throw new NotFoundException('Post-close correction workflow not found.');
    }
    if (
      workflow.type !== WorkflowType.POST_CLOSE_CORRECTION ||
      workflow.status !== WorkflowStatus.APPROVED ||
      workflow.entityType !== 'ClosingPeriod' ||
      workflow.entityId !== closingPeriodId
    ) {
      throw new BadRequestException(
        'workflowId must reference an APPROVED POST_CLOSE_CORRECTION workflow for this period.',
      );
    }

    const person = await this.prisma.person.findUnique({
      where: { id: parsed.personId },
      select: { id: true, organizationUnitId: true },
    });
    if (!person) {
      throw new NotFoundException('Person not found.');
    }
    if (period.organizationUnitId && person.organizationUnitId !== period.organizationUnitId) {
      throw new BadRequestException(
        'Correction booking person must belong to the closing period organization unit.',
      );
    }

    const timeType = await this.prisma.timeType.findUnique({
      where: { id: parsed.timeTypeId },
      select: { id: true, code: true, category: true },
    });
    if (!timeType) {
      throw new NotFoundException('Time type not found.');
    }

    const startTime = new Date(parsed.startTime);
    const endTime = new Date(parsed.endTime);
    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      startTime >= endTime
    ) {
      throw new BadRequestException('startTime and endTime must form a valid interval.');
    }
    if (startTime < period.periodStart || endTime > period.periodEnd) {
      throw new BadRequestException(
        'Correction booking interval must be inside the closing period time range.',
      );
    }

    const booking = await this.prisma.booking.create({
      data: {
        personId: parsed.personId,
        timeTypeId: parsed.timeTypeId,
        startTime,
        endTime,
        source: BookingSource.CORRECTION,
        note: parsed.note ?? parsed.reason,
      },
    });

    const durationHours = Number(
      ((endTime.getTime() - startTime.getTime()) / 3_600_000).toFixed(4),
    );
    await this.prisma.timeAccount.updateMany({
      where: {
        personId: parsed.personId,
        periodStart: { gte: period.periodStart },
        periodEnd: { lte: period.periodEnd },
      },
      data: {
        actualHours: { increment: durationHours },
        balance: { increment: durationHours },
        overtimeHours: { increment: durationHours },
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'POST_CLOSE_CORRECTION_APPLIED',
      entityType: 'Booking',
      entityId: booking.id,
      after: {
        closingPeriodId,
        workflowId: workflow.id,
        personId: booking.personId,
        timeTypeId: booking.timeTypeId,
        timeTypeCode: timeType.code,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime?.toISOString() ?? null,
        durationHours,
      },
      reason: parsed.reason,
    });

    return {
      id: booking.id,
      closingPeriodId,
      workflowId: workflow.id,
      personId: booking.personId,
      timeTypeId: booking.timeTypeId,
      timeTypeCode: timeType.code,
      timeTypeCategory: timeType.category,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime?.toISOString() ?? null,
      source: booking.source,
      note: booking.note,
      durationHours,
    };
  }

  async policyBundle(query: unknown) {
    const parsed = PolicyBundleQuerySchema.parse(query ?? {});
    const asOf = parsed.asOf ?? new Date().toISOString().slice(0, 10);
    const policies = getActivePolicyBundle(asOf).map((entry) => {
      const {
        type,
        id,
        name,
        description,
        version,
        effectiveFrom,
        effectiveTo,
        createdAt,
        createdBy,
        ...payload
      } = entry;
      return {
        type,
        id,
        name,
        description,
        version,
        effectiveFrom,
        effectiveTo,
        createdAt,
        createdBy,
        payload,
      };
    });

    return {
      asOf,
      policies,
    };
  }

  async policyHistory(query: unknown) {
    const parsed = PolicyHistoryQuerySchema.parse(query ?? {});
    const entries = getPolicyHistory(parsed.type as PolicyRuleType | undefined).map((entry) => {
      const {
        type,
        id,
        name,
        description,
        version,
        effectiveFrom,
        effectiveTo,
        createdAt,
        createdBy,
        ...payload
      } = entry;
      return {
        type,
        id,
        name,
        description,
        version,
        effectiveFrom,
        effectiveTo,
        createdAt,
        createdBy,
        payload,
      };
    });

    return {
      total: entries.length,
      entries,
    };
  }

  async createWebhookEndpoint(user: AuthenticatedIdentity, payload: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can configure webhooks.');
    }

    const actor = await this.personForUser(user);
    const parsed = CreateWebhookEndpointSchema.parse(payload);
    const validatedUrl = assertWebhookTargetUrl(parsed.url).toString();
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        name: parsed.name,
        url: validatedUrl,
        subscribedEvents: parsed.subscribedEvents,
        secretRef: parsed.secretRef,
        createdById: actor.id,
        isActive: true,
      },
    });

    await this.appendAudit({
      actorId: actor.id,
      action: 'WEBHOOK_ENDPOINT_CREATED',
      entityType: 'WebhookEndpoint',
      entityId: endpoint.id,
      after: {
        url: endpoint.url,
        subscribedEvents: endpoint.subscribedEvents,
        isActive: endpoint.isActive,
      },
    });

    return endpoint;
  }

  async listWebhookEndpoints(user: AuthenticatedIdentity) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read webhook endpoints.');
    }

    return this.prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async listOutboxEvents(user: AuthenticatedIdentity, query: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read outbox events.');
    }

    const parsed = OutboxQuerySchema.parse(query ?? {});
    const events = await this.prisma.domainEventOutbox.findMany({
      where: parsed.status ? { status: parsed.status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      status: event.status,
      attempts: event.attempts,
      nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
      lastError: event.lastError,
      processedAt: event.processedAt?.toISOString() ?? null,
      createdAt: event.createdAt.toISOString(),
    }));
  }

  async listWebhookDeliveries(user: AuthenticatedIdentity, query: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read webhook deliveries.');
    }

    const parsed = DeliveryQuerySchema.parse(query ?? {});
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: parsed.eventId ? { outboxEventId: parsed.eventId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    return deliveries.map((delivery) => ({
      id: delivery.id,
      outboxEventId: delivery.outboxEventId,
      endpointId: delivery.endpointId,
      attempt: delivery.attempt,
      status: delivery.status,
      httpStatus: delivery.httpStatus,
      responseBody: delivery.responseBody,
      error: delivery.error,
      deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
      createdAt: delivery.createdAt.toISOString(),
    }));
  }

  async dispatchWebhooks(user: AuthenticatedIdentity) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can dispatch webhooks.');
    }

    const actor = await this.personForUser(user);
    const now = new Date();
    const batchSize = this.webhookBatchSize();
    const maxAttempts = this.webhookMaxAttempts();
    const timeoutMs = this.webhookTimeoutMs();

    const pendingEvents = await this.prisma.domainEventOutbox.findMany({
      where: {
        status: { in: [OutboxStatus.PENDING, OutboxStatus.FAILED] },
        attempts: { lt: maxAttempts },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });

    let processed = 0;
    let delivered = 0;
    let failed = 0;
    let skipped = 0;

    for (const event of pendingEvents) {
      processed += 1;
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: { isActive: true, subscribedEvents: { has: event.eventType } },
        orderBy: { createdAt: 'asc' },
      });

      const attempt = event.attempts + 1;
      const payloadObject =
        typeof event.payload === 'object' && event.payload !== null
          ? (event.payload as Record<string, unknown>)
          : { payload: event.payload };

      if (endpoints.length === 0) {
        skipped += 1;
        await this.prisma.domainEventOutbox.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.DELIVERED,
            attempts: attempt,
            processedAt: now,
            lastError: null,
            nextAttemptAt: null,
          },
        });
        continue;
      }

      const envelope = {
        eventId: event.id,
        eventType: event.eventType,
        timestamp: event.createdAt.toISOString(),
        version: 1,
        source: 'cueq-api',
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        payload: payloadObject,
      };

      let eventFailed = false;
      let lastError: string | null = null;

      for (const endpoint of endpoints) {
        let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
        let httpStatus: number | null = null;
        let responseBody: string | null = null;
        let error: string | null = null;
        let deliveredAt: Date | null = null;
        let targetUrl: string;

        try {
          targetUrl = (await assertWebhookDispatchTargetUrl(endpoint.url)).toString();
        } catch (validationError) {
          status = 'FAILED';
          error =
            validationError instanceof BadRequestException
              ? String(validationError.message)
              : validationError instanceof Error
                ? validationError.message
                : 'Invalid webhook endpoint url';
          error = truncateForStorage(error, WEBHOOK_ERROR_MAX_CHARS);
          eventFailed = true;
          lastError = error;

          await this.prisma.webhookDelivery.create({
            data: {
              outboxEventId: event.id,
              endpointId: endpoint.id,
              attempt,
              status,
              httpStatus,
              responseBody,
              error,
              deliveredAt,
            },
          });
          continue;
        }

        try {
          const response = await fetch(targetUrl, {
            method: 'POST',
            redirect: 'manual',
            headers: {
              'Content-Type': 'application/json',
              'X-Cueq-Event-Type': event.eventType,
            },
            body: JSON.stringify(envelope),
            signal: AbortSignal.timeout(timeoutMs),
          });

          httpStatus = response.status;
          responseBody = await readResponseBodyWithLimit(response, WEBHOOK_RESPONSE_BODY_MAX_CHARS);
          if (response.ok) {
            deliveredAt = new Date();
          } else {
            status = 'FAILED';
            error = `HTTP ${response.status}`;
          }
        } catch (dispatchError) {
          status = 'FAILED';
          error = dispatchError instanceof Error ? dispatchError.message : 'Unknown dispatch error';
        }
        error = truncateForStorage(error, WEBHOOK_ERROR_MAX_CHARS);

        if (status === 'FAILED') {
          eventFailed = true;
          lastError = error ?? 'Webhook delivery failed';
        }

        await this.prisma.webhookDelivery.create({
          data: {
            outboxEventId: event.id,
            endpointId: endpoint.id,
            attempt,
            status,
            httpStatus,
            responseBody,
            error,
            deliveredAt,
          },
        });
      }

      if (!eventFailed) {
        delivered += 1;
        await this.prisma.domainEventOutbox.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.DELIVERED,
            attempts: attempt,
            processedAt: new Date(),
            lastError: null,
            nextAttemptAt: null,
          },
        });
      } else {
        failed += 1;
        const retryDelayMinutes = 2 ** Math.min(attempt, 6);
        await this.prisma.domainEventOutbox.update({
          where: { id: event.id },
          data: {
            status: OutboxStatus.FAILED,
            attempts: attempt,
            processedAt: null,
            lastError,
            nextAttemptAt:
              attempt >= maxAttempts ? null : new Date(now.getTime() + retryDelayMinutes * 60_000),
          },
        });
      }
    }

    await this.appendAudit({
      actorId: actor.id,
      action: 'WEBHOOK_DISPATCH_RUN',
      entityType: 'DomainEventOutbox',
      entityId: `dispatch-${now.toISOString()}`,
      after: { processed, delivered, failed, skipped },
    });

    return {
      processed,
      delivered,
      failed,
      skipped,
      batchSize,
      maxAttempts,
      timeoutMs,
    };
  }

  async reportTeamAbsence(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const actor = await this.personForUser(user);
    const parsed = TeamAbsenceQuerySchema.parse(query ?? {});
    const targetOuId = parsed.organizationUnitId ?? actor.organizationUnitId;

    if (user.role === Role.TEAM_LEAD && targetOuId !== actor.organizationUnitId) {
      throw new ForbiddenException('Team leads can only access reports for their own unit.');
    }

    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.000Z`);

    const population = await this.prisma.person.count({
      where: {
        organizationUnitId: targetOuId,
        role: { in: [Role.EMPLOYEE, Role.TEAM_LEAD, Role.SHIFT_PLANNER] },
      },
    });
    const minGroupSize = this.minGroupSize();
    const suppressed = population < minGroupSize;

    let totals = { requests: 0, days: 0 };
    let buckets: Array<{ type: string; requests: number; days: number }> = [];

    if (!suppressed) {
      const absences = await this.prisma.absence.findMany({
        where: {
          person: { organizationUnitId: targetOuId },
          startDate: { lte: to },
          endDate: { gte: from },
        },
      });

      const byType = new Map<string, { requests: number; days: number }>();
      for (const absence of absences) {
        const type = absence.type;
        const current = byType.get(type) ?? { requests: 0, days: 0 };
        current.requests += 1;
        current.days += Number(absence.days);
        byType.set(type, current);
      }

      totals = {
        requests: absences.length,
        days: Number(absences.reduce((sum, absence) => sum + Number(absence.days), 0).toFixed(2)),
      };
      buckets = [...byType.entries()].map(([type, value]) => ({
        type,
        requests: value.requests,
        days: Number(value.days.toFixed(2)),
      }));
    }

    await this.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `team-absence:${targetOuId}:${parsed.from}:${parsed.to}`,
      after: {
        report: 'team-absence',
        organizationUnitId: targetOuId,
        suppressed,
      },
    });

    return {
      organizationUnitId: targetOuId,
      from: parsed.from,
      to: parsed.to,
      suppression: {
        suppressed,
        minGroupSize,
        population,
      },
      totals,
      buckets,
    };
  }

  async reportOeOvertime(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const actor = await this.personForUser(user);
    const parsed = OeOvertimeQuerySchema.parse(query ?? {});
    const targetOuId = parsed.organizationUnitId ?? actor.organizationUnitId;

    if (user.role === Role.TEAM_LEAD && targetOuId !== actor.organizationUnitId) {
      throw new ForbiddenException('Team leads can only access reports for their own unit.');
    }

    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.000Z`);
    const minGroupSize = this.minGroupSize();

    const accounts = await this.prisma.timeAccount.findMany({
      where: {
        person: { organizationUnitId: targetOuId },
        periodStart: { lte: to },
        periodEnd: { gte: from },
      },
      select: { personId: true, balance: true, overtimeHours: true },
    });

    const distinctPeople = new Set(accounts.map((account) => account.personId));
    const population = distinctPeople.size;
    const suppressed = population < minGroupSize;

    const totalBalanceHours = suppressed
      ? 0
      : Number(accounts.reduce((sum, account) => sum + Number(account.balance), 0).toFixed(2));
    const totalOvertimeHours = suppressed
      ? 0
      : Number(
          accounts.reduce((sum, account) => sum + Number(account.overtimeHours), 0).toFixed(2),
        );

    await this.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `oe-overtime:${targetOuId}:${parsed.from}:${parsed.to}`,
      after: {
        report: 'oe-overtime',
        organizationUnitId: targetOuId,
        suppressed,
      },
    });

    return {
      organizationUnitId: targetOuId,
      from: parsed.from,
      to: parsed.to,
      suppression: {
        suppressed,
        minGroupSize,
        population,
      },
      totals: {
        people: suppressed ? 0 : population,
        totalBalanceHours,
        totalOvertimeHours,
        avgBalanceHours:
          suppressed || population === 0 ? 0 : Number((totalBalanceHours / population).toFixed(2)),
      },
    };
  }

  async reportClosingCompletion(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const actor = await this.personForUser(user);
    const parsed = ClosingCompletionQuerySchema.parse(query ?? {});
    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.000Z`);

    const periods = await this.prisma.closingPeriod.findMany({
      where: {
        periodStart: { lte: to },
        periodEnd: { gte: from },
      },
      select: { status: true },
    });

    const totals = {
      periods: periods.length,
      exported: periods.filter((period) => period.status === ClosingStatus.EXPORTED).length,
      approved: periods.filter((period) => period.status === ClosingStatus.CLOSED).length,
      review: periods.filter((period) => period.status === ClosingStatus.REVIEW).length,
      open: periods.filter((period) => period.status === ClosingStatus.OPEN).length,
      completionRate:
        periods.length === 0
          ? 0
          : Number(
              (
                periods.filter((period) => period.status === ClosingStatus.EXPORTED).length /
                periods.length
              ).toFixed(4),
            ),
    };

    await this.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `closing-completion:${parsed.from}:${parsed.to}`,
      after: {
        report: 'closing-completion',
      },
    });

    return {
      from: parsed.from,
      to: parsed.to,
      totals,
    };
  }

  async reportAuditSummary(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadSensitiveReports(user);
    const actor = await this.personForUser(user);
    const parsed = AuditSummaryQuerySchema.parse(query ?? {});
    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.999Z`);

    const entries = await this.prisma.auditEntry.findMany({
      where: {
        timestamp: {
          gte: from,
          lte: to,
        },
      },
      select: {
        actorId: true,
        action: true,
        entityType: true,
      },
    });

    const uniqueActors = new Set<string>();
    const byAction = new Map<string, number>();
    const byEntityType = new Map<string, number>();

    for (const entry of entries) {
      uniqueActors.add(entry.actorId);
      byAction.set(entry.action, (byAction.get(entry.action) ?? 0) + 1);
      byEntityType.set(entry.entityType, (byEntityType.get(entry.entityType) ?? 0) + 1);
    }

    const reportAccesses = byAction.get('REPORT_ACCESSED') ?? 0;
    const exportsTriggered = byAction.get('CLOSING_EXPORTED') ?? 0;
    const lockBlocks = byAction.get('CLOSING_LOCK_BLOCKED') ?? 0;

    await this.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `audit-summary:${parsed.from}:${parsed.to}`,
      after: {
        report: 'audit-summary',
        suppressed: false,
      },
    });

    return {
      from: parsed.from,
      to: parsed.to,
      totals: {
        entries: entries.length,
        uniqueActors: uniqueActors.size,
        reportAccesses,
        exportsTriggered,
        lockBlocks,
      },
      byAction: [...byAction.entries()]
        .map(([action, count]) => ({ action, count }))
        .sort((left, right) => left.action.localeCompare(right.action)),
      byEntityType: [...byEntityType.entries()]
        .map(([entityType, count]) => ({ entityType, count }))
        .sort((left, right) => left.entityType.localeCompare(right.entityType)),
    };
  }

  async reportComplianceSummary(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadSensitiveReports(user);
    const actor = await this.personForUser(user);
    const parsed = ComplianceSummaryQuerySchema.parse(query ?? {});
    const from = new Date(`${parsed.from}T00:00:00.000Z`);
    const to = new Date(`${parsed.to}T23:59:59.999Z`);

    const [reportAccessEntries, lockBlocks, postCloseCorrections, periods, exportRuns, backupRun] =
      await Promise.all([
        this.prisma.auditEntry.findMany({
          where: {
            action: 'REPORT_ACCESSED',
            timestamp: {
              gte: from,
              lte: to,
            },
          },
          select: {
            after: true,
          },
        }),
        this.prisma.auditEntry.count({
          where: {
            action: 'CLOSING_LOCK_BLOCKED',
            timestamp: {
              gte: from,
              lte: to,
            },
          },
        }),
        this.prisma.auditEntry.count({
          where: {
            action: 'POST_CLOSE_CORRECTION_APPLIED',
            timestamp: {
              gte: from,
              lte: to,
            },
          },
        }),
        this.prisma.closingPeriod.findMany({
          where: {
            periodStart: { lte: to },
            periodEnd: { gte: from },
          },
          select: {
            status: true,
          },
        }),
        this.prisma.exportRun.findMany({
          where: {
            exportedAt: {
              gte: from,
              lte: to,
            },
          },
          orderBy: {
            exportedAt: 'desc',
          },
          select: {
            checksum: true,
            exportedAt: true,
          },
        }),
        this.prisma.auditEntry.findFirst({
          where: {
            action: 'BACKUP_RESTORE_VERIFIED',
            timestamp: {
              gte: from,
              lte: to,
            },
          },
          orderBy: {
            timestamp: 'desc',
          },
        }),
      ]);

    const reportAccesses = reportAccessEntries.length;
    const suppressedReportAccesses = reportAccessEntries.reduce((total, entry) => {
      if (
        entry.after &&
        typeof entry.after === 'object' &&
        !Array.isArray(entry.after) &&
        (entry.after as Record<string, unknown>).suppressed === true
      ) {
        return total + 1;
      }
      return total;
    }, 0);
    const suppressionRate =
      reportAccesses === 0 ? 0 : Number((suppressedReportAccesses / reportAccesses).toFixed(4));

    const periodsTotal = periods.length;
    const periodsExported = periods.filter(
      (period) => period.status === ClosingStatus.EXPORTED,
    ).length;
    const completionRate =
      periodsTotal === 0 ? 0 : Number((periodsExported / periodsTotal).toFixed(4));

    const runs = exportRuns.length;
    const uniqueChecksums = new Set(exportRuns.map((run) => run.checksum)).size;
    const duplicateChecksums = runs - uniqueChecksums;

    await this.appendAudit({
      actorId: actor.id,
      action: 'REPORT_ACCESSED',
      entityType: 'Report',
      entityId: `compliance-summary:${parsed.from}:${parsed.to}`,
      after: {
        report: 'compliance-summary',
        suppressed: false,
      },
    });

    return {
      from: parsed.from,
      to: parsed.to,
      privacy: {
        minGroupSize: this.minGroupSize(),
        reportAccesses,
        suppressedReportAccesses,
        suppressionRate,
      },
      closing: {
        periods: periodsTotal,
        exported: periodsExported,
        completionRate,
        lockBlocks,
        postCloseCorrections,
      },
      payrollExport: {
        runs,
        uniqueChecksums,
        duplicateChecksums,
        lastRunAt: exportRuns[0]?.exportedAt.toISOString() ?? null,
      },
      operations: {
        lastBackupRestoreVerifiedAt: backupRun?.timestamp.toISOString() ?? null,
      },
    };
  }

  reportCustomOptions(user: AuthenticatedIdentity) {
    if (!REPORT_ALLOWED_ROLES.has(user.role)) {
      throw new ForbiddenException('Role does not permit access to reports.');
    }

    return CustomReportOptionsSchema.parse({
      reportTypes: ['TEAM_ABSENCE', 'OE_OVERTIME', 'CLOSING_COMPLETION'],
      groupBy: ['ORGANIZATION_UNIT', 'NONE'],
      metrics: ['requests', 'days', 'people', 'totalOvertimeHours', 'completionRate', 'exported'],
    });
  }

  async reportCustomPreview(user: AuthenticatedIdentity, query: unknown) {
    this.assertCanReadReports(user);
    const normalizedQuery =
      query && typeof query === 'object' && !Array.isArray(query)
        ? { ...(query as Record<string, unknown>) }
        : {};
    if (typeof normalizedQuery.metrics === 'string') {
      normalizedQuery.metrics = [normalizedQuery.metrics];
    }

    const parsed = CustomReportPreviewQuerySchema.parse(normalizedQuery);

    const metricAllowList: Record<string, Set<string>> = {
      TEAM_ABSENCE: new Set(['requests', 'days']),
      OE_OVERTIME: new Set(['people', 'totalOvertimeHours']),
      CLOSING_COMPLETION: new Set(['completionRate', 'exported']),
    };
    const allowedMetrics = metricAllowList[parsed.reportType];
    const disallowed = parsed.metrics.filter((metric) => !allowedMetrics?.has(metric));
    if (disallowed.length > 0) {
      throw new BadRequestException(
        `Unsupported metrics for ${parsed.reportType}: ${disallowed.join(', ')}`,
      );
    }

    if (parsed.reportType === 'TEAM_ABSENCE') {
      const report = await this.reportTeamAbsence(user, {
        organizationUnitId: parsed.organizationUnitId,
        from: parsed.from,
        to: parsed.to,
      });
      const metricValues: Record<string, number> = {};
      if (parsed.metrics.includes('requests')) {
        metricValues.requests = report.totals.requests;
      }
      if (parsed.metrics.includes('days')) {
        metricValues.days = report.totals.days;
      }

      return {
        reportType: parsed.reportType,
        groupBy: parsed.groupBy,
        from: parsed.from,
        to: parsed.to,
        suppression: report.suppression,
        rows: [
          {
            group: parsed.groupBy === 'ORGANIZATION_UNIT' ? report.organizationUnitId : 'ALL',
            metrics: metricValues,
          },
        ],
      };
    }

    if (parsed.reportType === 'OE_OVERTIME') {
      const report = await this.reportOeOvertime(user, {
        organizationUnitId: parsed.organizationUnitId,
        from: parsed.from,
        to: parsed.to,
      });
      const metricValues: Record<string, number> = {};
      if (parsed.metrics.includes('people')) {
        metricValues.people = report.totals.people;
      }
      if (parsed.metrics.includes('totalOvertimeHours')) {
        metricValues.totalOvertimeHours = report.totals.totalOvertimeHours;
      }

      return {
        reportType: parsed.reportType,
        groupBy: parsed.groupBy,
        from: parsed.from,
        to: parsed.to,
        suppression: report.suppression,
        rows: [
          {
            group: parsed.groupBy === 'ORGANIZATION_UNIT' ? report.organizationUnitId : 'ALL',
            metrics: metricValues,
          },
        ],
      };
    }

    const report = await this.reportClosingCompletion(user, {
      from: parsed.from,
      to: parsed.to,
    });
    const metricValues: Record<string, number> = {};
    if (parsed.metrics.includes('completionRate')) {
      metricValues.completionRate = report.totals.completionRate;
    }
    if (parsed.metrics.includes('exported')) {
      metricValues.exported = report.totals.exported;
    }

    return {
      reportType: parsed.reportType,
      groupBy: parsed.groupBy,
      from: parsed.from,
      to: parsed.to,
      rows: [
        {
          group: 'ALL',
          metrics: metricValues,
        },
      ],
    };
  }

  async importTerminalBatch(user: AuthenticatedIdentity, payload: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can import terminal batches.');
    }

    const actor = await this.personForUser(user);
    return this.terminalGatewayService.importBatch(user, actor.id, payload);
  }

  async importTerminalBatchFile(user: AuthenticatedIdentity, payload: unknown) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can import terminal batches.');
    }

    const actor = await this.personForUser(user);
    return this.terminalGatewayService.importBatchFile(user, actor.id, payload);
  }

  async getTerminalBatch(user: AuthenticatedIdentity, batchId: string) {
    if (!HR_LIKE_ROLES.has(user.role)) {
      throw new ForbiddenException('Only HR/Admin can read terminal batches.');
    }
    return this.terminalGatewayService.getBatch(batchId);
  }

  async computeProratedTarget(payload: {
    month: string;
    actualHours: number;
    transitionAdjustmentHours?: number;
    segments: Array<{ from: string; to: string; weeklyHours: number }>;
  }) {
    return calculateProratedMonthlyTarget(payload);
  }
}
