/** Stable appointment administration with append-only effective configuration. */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@cueq/database';
import {
  AssignmentQuerySchema,
  CreateEmploymentAssignmentSchema,
  CreateEmploymentTermSchema,
  CursorQuerySchema,
} from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { ClosingLockHelper } from '../../platform/transactions/closing-lock.helper.js';
import {
  lockPersonWrites,
  lockEmploymentPopulationWrites,
} from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { assertPersonnelScope } from './personnel-scope.js';
import { CapabilityHelper } from './capability.helper.js';

type TermInput = ReturnType<typeof CreateEmploymentTermSchema.parse>;
function termData(input: TermInput) {
  if (new Set(input.workingDays).size !== input.workingDays.length)
    throw new BadRequestException('Working days must be distinct ISO weekdays.');
  return {
    ...input,
    effectiveFrom: new Date(input.effectiveFrom),
    effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
    policyReferences: input.policyReferences as Prisma.InputJsonValue,
  };
}
function termDto(term: Prisma.EmploymentTermGetPayload<object>) {
  return {
    ...term,
    effectiveFrom: term.effectiveFrom?.toISOString() ?? null,
    effectiveTo: term.effectiveTo?.toISOString() ?? null,
    weeklyHours: term.weeklyHours?.toNumber() ?? null,
    dailyTargetHours: term.dailyTargetHours?.toNumber() ?? null,
  };
}

@Injectable()
export class EmploymentManagementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CapabilityHelper) private readonly capabilities: CapabilityHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
    @Inject(ClosingLockHelper) private readonly closingLocks: ClosingLockHelper,
  ) {}

  async list(actorId: string, query: unknown) {
    const input = parseRequest(AssignmentQuerySchema, query);
    const personId = input.personId ?? actorId;
    await assertPersonnelScope(this.prisma, actorId, 'personnel.read', personId);
    const at = input.at ? new Date(input.at) : null;
    const rows = await this.prisma.employmentAssignment.findMany({
      where: {
        personId,
        ...cursorWhere('createdAt', input.cursor),
        ...(at
          ? {
              terms: {
                some: {
                  AND: [
                    { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: at } }] },
                    { OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
                  ],
                },
              },
            }
          : {}),
      },
      include: { terms: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 2 } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(
      rows,
      input.limit,
      'createdAt',
      (r) => r.createdAt,
      (r) => {
        const terms = cursorPage(r.terms, 1, 'createdAt', (t) => t.createdAt, termDto);
        return {
          ...r,
          employmentStartDate: r.employmentStartDate?.toISOString() ?? null,
          employmentEndDate: r.employmentEndDate?.toISOString() ?? null,
          createdAt: r.createdAt.toISOString(),
          terms: terms.items,
          termsNextCursor: terms.nextCursor,
        };
      },
    );
  }

  async terms(actorId: string, assignmentId: string, query: unknown) {
    const input = parseRequest(CursorQuerySchema, query);
    const assignment = await this.prisma.employmentAssignment.findUnique({
      where: { id: assignmentId },
      select: { personId: true },
    });
    if (!assignment) throw new NotFoundException('Appointment not found.');
    await assertPersonnelScope(this.prisma, actorId, 'personnel.read', assignment.personId);
    const rows = await this.prisma.employmentTerm.findMany({
      where: { assignmentId, ...cursorWhere('createdAt', input.cursor) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(rows, input.limit, 'createdAt', (r) => r.createdAt, termDto);
  }

  async create(actorId: string, payload: unknown) {
    const input = parseRequest(CreateEmploymentAssignmentSchema, payload);
    const term = termData(input.term);
    const employmentStartDate = input.employmentStartDate
      ? new Date(input.employmentStartDate)
      : null;
    const employmentEndDate = input.employmentEndDate ? new Date(input.employmentEndDate) : null;
    if (
      (employmentStartDate && employmentEndDate && employmentStartDate > employmentEndDate) ||
      (employmentStartDate && term.effectiveFrom < employmentStartDate) ||
      (employmentEndDate &&
        (!term.effectiveTo ||
          term.effectiveTo.getTime() > employmentEndDate.getTime() + 86_400_000))
    )
      throw new BadRequestException('Appointment dates must cover the configured terms.');
    return this.prisma.$transaction(async (tx) => {
      await assertPersonnelScope(tx, actorId, 'personnel.manage', input.personId);
      await this.capabilities.assert(
        actorId,
        'personnel.manage',
        { organizationUnitId: term.organizationUnitId },
        tx,
      );
      await this.lockTermPopulation(tx, actorId, input.personId, term);
      await lockPersonWrites(tx, [input.personId]);
      await assertPersonnelScope(tx, actorId, 'personnel.manage', input.personId);
      await this.capabilities.assert(
        actorId,
        'personnel.manage',
        { organizationUnitId: term.organizationUnitId },
        tx,
      );
      await validateReferences(tx, term);
      const assignment = await tx.employmentAssignment.create({
        data: {
          personId: input.personId,
          sourceSystem: input.sourceSystem,
          externalAppointmentId: input.externalAppointmentId,
          label: input.label,
          employmentStartDate,
          employmentEndDate,
          terms: { create: term },
        },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'EMPLOYMENT_ASSIGNMENT_CREATED',
          entityType: 'EmploymentAssignment',
          entityId: assignment.id,
          after: { personId: input.personId, organizationUnitId: term.organizationUnitId },
        },
        tx,
      );
      return assignment;
    });
  }

  async appendTerm(actorId: string, assignmentId: string, payload: unknown) {
    const term = termData(parseRequest(CreateEmploymentTermSchema, payload));
    if (term.effectiveFrom < new Date())
      throw new BadRequestException(
        'New terms must start in the future; historical terms are retained.',
      );
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.employmentAssignment.findUnique({ where: { id: assignmentId } });
      if (!assignment) throw new NotFoundException('Appointment not found.');
      await assertPersonnelScope(tx, actorId, 'personnel.manage', assignment.personId);
      await this.capabilities.assert(
        actorId,
        'personnel.manage',
        { organizationUnitId: term.organizationUnitId },
        tx,
      );
      const prior = await tx.employmentTerm.findMany({
        where: {
          assignmentId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: term.effectiveFrom } }],
        },
        select: { organizationUnitId: true },
        take: 101,
      });
      if (prior.length > 100)
        throw new ConflictException('Split configuration changes covering more than 100 terms.');
      await this.lockTermPopulation(
        tx,
        actorId,
        assignment.personId,
        term,
        prior.map((row) => row.organizationUnitId),
      );
      await lockPersonWrites(tx, [assignment.personId]);
      await assertPersonnelScope(tx, actorId, 'personnel.manage', assignment.personId);
      await this.capabilities.assert(
        actorId,
        'personnel.manage',
        { organizationUnitId: term.organizationUnitId },
        tx,
      );
      await validateReferences(tx, term);
      if (
        assignment.employmentEndDate &&
        (!term.effectiveTo ||
          term.effectiveTo.getTime() > assignment.employmentEndDate.getTime() + 86_400_000)
      )
        throw new BadRequestException('Term exceeds appointment end date.');
      const current = await tx.employmentTerm.findMany({
        where: {
          assignmentId,
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: term.effectiveFrom } }],
        },
        take: 2,
      });
      if (
        current.length !== 1 ||
        !current[0] ||
        (current[0].effectiveFrom && current[0].effectiveFrom >= term.effectiveFrom)
      )
        throw new ConflictException(
          'Append after the last existing term; overlapping future versions are not replaced.',
        );
      await assertNoFutureRecords(tx, assignmentId, term.effectiveFrom);
      await tx.employmentTerm.update({
        where: { id: current[0].id },
        data: { effectiveTo: term.effectiveFrom },
      });
      const created = await tx.employmentTerm.create({ data: { ...term, assignmentId } });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'EMPLOYMENT_TERM_APPENDED',
          entityType: 'EmploymentAssignment',
          entityId: assignmentId,
          after: { termId: created.id, effectiveFrom: term.effectiveFrom.toISOString() },
        },
        tx,
      );
      return termDto(created);
    });
  }
  private async lockTermPopulation(
    tx: Prisma.TransactionClient,
    actorId: string,
    personId: string,
    term: ReturnType<typeof termData>,
    priorUnits: string[] = [],
  ) {
    await this.closingLocks.assertClosingPeriodsUnlockedForRangesInTransaction(
      [...new Set([term.organizationUnitId, ...priorUnits])].map((organizationUnitId) => ({
        actorId,
        entityType: 'Person',
        entityId: personId,
        attemptedAction: 'EMPLOYMENT_CONFIGURED',
        organizationUnitId,
        from: term.effectiveFrom,
        to: term.effectiveTo ?? new Date('9999-12-31T00:00:00Z'),
      })),
      tx,
    );
    await lockEmploymentPopulationWrites(tx);
  }
}

async function validateReferences(tx: Prisma.TransactionClient, term: ReturnType<typeof termData>) {
  const [unit, group, calendar, supervisor, model] = await Promise.all([
    tx.organizationUnit.findUnique({
      where: { id: term.organizationUnitId },
      select: { id: true },
    }),
    tx.employmentGroup.findUnique({ where: { id: term.employmentGroupId }, select: { id: true } }),
    tx.holidayCalendar.findUnique({ where: { id: term.holidayCalendarId }, select: { id: true } }),
    term.supervisorId
      ? tx.person.findUnique({ where: { id: term.supervisorId }, select: { id: true } })
      : true,
    term.workTimeModelId
      ? tx.workTimeModel.findUnique({ where: { id: term.workTimeModelId }, select: { id: true } })
      : true,
  ]);
  if (!unit || !group || !calendar || !supervisor || !model)
    throw new BadRequestException('An appointment configuration reference does not exist.');
}

/** Existing attendance, balances and approved planning may never be silently reinterpreted. */
async function assertNoFutureRecords(
  tx: Prisma.TransactionClient,
  assignmentId: string,
  boundary: Date,
) {
  const [booking, absence, account, shift, oncall] = await Promise.all([
    tx.booking.findFirst({
      where: { assignmentId, OR: [{ endTime: null }, { endTime: { gt: boundary } }] },
      select: { id: true },
    }),
    tx.absence.findFirst({
      where: { assignmentId, endDate: { gte: boundary } },
      select: { id: true },
    }),
    tx.timeAccount.findFirst({
      where: { assignmentId, periodStart: { lt: boundary }, periodEnd: { gt: boundary } },
      select: { id: true },
    }),
    tx.shiftAssignment.findFirst({
      where: { assignmentId, shift: { endTime: { gt: boundary } } },
      select: { id: true },
    }),
    tx.onCallRotation.findFirst({
      where: { assignmentId, endTime: { gt: boundary } },
      select: { id: true },
    }),
  ]);
  if (booking || absence || account || shift || oncall)
    throw new ConflictException(
      'Existing records reach the new terms interval. Split or reconcile those records explicitly first.',
    );
}
