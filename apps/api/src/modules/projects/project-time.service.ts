/** Allocates ended personal attendance to projects without changing attendance credit. */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AllocateProjectTimeSchema, ProjectTimeQuerySchema } from '@cueq/contracts';
import { Prisma, TimeTypeCategory } from '@cueq/database';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorSqlWhere, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import {
  lockPersonWrites,
  lockProjectWrites,
} from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { AssignmentHelper, CapabilityHelper } from '../people/public.js';
import { allocationDto } from './project-dto.js';
import { assertProjectScope } from './project-scope.js';

type ProjectTimeQuery = ReturnType<typeof ProjectTimeQuerySchema.parse>;
type AvailableBookingRow = {
  id: string;
  assignmentId: string;
  startTime: Date;
  endTime: Date;
  durationMinutes: number;
  allocatedMinutes: number;
};

function parseTimeQuery(query: unknown): ProjectTimeQuery {
  const input = parseRequest(ProjectTimeQuerySchema, query);
  if (input.from && input.to && Date.parse(input.from) >= Date.parse(input.to)) {
    throw new BadRequestException('to must be after from.');
  }
  return input;
}

function bookingDateWhere(input: ProjectTimeQuery) {
  return {
    ...(input.from ? { gte: new Date(input.from) } : {}),
    ...(input.to ? { lt: new Date(input.to) } : {}),
  };
}

function sqlDatePredicate(input: ProjectTimeQuery) {
  return Prisma.sql`
    (${input.from ? Prisma.sql`b."startTime" >= ${new Date(input.from)}` : Prisma.sql`TRUE`})
    AND (${input.to ? Prisma.sql`b."startTime" < ${new Date(input.to)}` : Prisma.sql`TRUE`})
  `;
}

function membershipPredicate(projectId: string | undefined) {
  if (!projectId) return Prisma.sql`TRUE`;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM project_memberships m
    WHERE m."projectId" = ${projectId} AND m."assignmentId" = b."assignmentId"
      AND m."personId" = b."personId" AND m."effectiveFrom" <= b."startTime"
      AND (m."effectiveTo" IS NULL OR m."effectiveTo" >= b."endTime")
  )`;
}

@Injectable()
export class ProjectTimeService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AssignmentHelper) private readonly assignments: AssignmentHelper,
    @Inject(CapabilityHelper) private readonly capabilities: CapabilityHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  private async assertReadScope(actorId: string, input: ProjectTimeQuery) {
    await this.assignments.selectAssignment(actorId, input.assignmentId);
    if (input.projectId) {
      await assertProjectScope(this.prisma, actorId, 'projects.allocate', input.projectId);
      return;
    }
    await this.capabilities.assert(actorId, 'projects.allocate', { personId: actorId });
  }

  async allocate(actorId: string, payload: unknown) {
    const input = parseRequest(AllocateProjectTimeSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await lockPersonWrites(tx, [actorId]);
      await lockProjectWrites(tx, input.projectId);
      await assertProjectScope(tx, actorId, 'projects.allocate', input.projectId);
      const project = await tx.project.findUnique({ where: { id: input.projectId } });
      if (!project) throw new BadRequestException('Project not found.');
      if (project.archivedAt) {
        throw new ConflictException('Archived projects cannot receive time allocations.');
      }
      const booking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        include: { timeType: { select: { category: true } } },
      });
      if (!booking || booking.personId !== actorId) {
        throw new BadRequestException('Booking is not available for personal allocation.');
      }
      if (booking.assignmentId !== input.assignmentId) {
        throw new BadRequestException('Booking appointment does not match the allocation.');
      }
      if (!booking.endTime || booking.endTime > new Date()) {
        throw new ConflictException('Only ended bookings can be allocated.');
      }
      if (
        booking.timeType.category === TimeTypeCategory.PAUSE ||
        booking.timeType.category === TimeTypeCategory.ON_CALL
      ) {
        throw new ConflictException('This booking category cannot be allocated to a project.');
      }
      const membership = await tx.projectMembership.findFirst({
        where: {
          projectId: input.projectId,
          personId: actorId,
          assignmentId: booking.assignmentId,
          effectiveFrom: { lte: booking.startTime },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: booking.endTime } }],
        },
        select: { id: true },
      });
      if (!membership) {
        throw new ConflictException('Project membership does not cover the booking interval.');
      }
      const existing = await tx.projectTimeAllocation.findUnique({
        where: {
          bookingId_projectId: { bookingId: booking.id, projectId: input.projectId },
        },
      });
      const otherAllocations = await tx.projectTimeAllocation.aggregate({
        where: { bookingId: booking.id, projectId: { not: input.projectId } },
        _sum: { minutes: true },
      });
      const durationMinutes = Math.floor(
        (booking.endTime.getTime() - booking.startTime.getTime()) / 60_000,
      );
      if ((otherAllocations._sum.minutes ?? 0) + input.minutes > durationMinutes) {
        throw new ConflictException('Project allocations exceed the booking duration.');
      }
      const allocation = await tx.projectTimeAllocation.upsert({
        where: {
          bookingId_projectId: { bookingId: booking.id, projectId: input.projectId },
        },
        create: {
          projectId: input.projectId,
          bookingId: booking.id,
          assignmentId: booking.assignmentId,
          personId: actorId,
          minutes: input.minutes,
          note: input.note,
        },
        update: { minutes: input.minutes, note: input.note },
        include: {
          project: { select: { code: true, name: true } },
          booking: { select: { startTime: true, endTime: true } },
        },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: existing ? 'PROJECT_TIME_ALLOCATION_UPDATED' : 'PROJECT_TIME_ALLOCATION_CREATED',
          entityType: 'ProjectTimeAllocation',
          entityId: allocation.id,
          before: existing ? { minutes: existing.minutes, note: existing.note } : undefined,
          after: {
            projectId: input.projectId,
            bookingId: booking.id,
            assignmentId: booking.assignmentId,
            minutes: input.minutes,
          },
        },
        tx,
      );
      return allocationDto(allocation);
    });
  }

  async release(actorId: string, allocationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockPersonWrites(tx, [actorId]);
      const allocation = await tx.projectTimeAllocation.findFirst({
        where: { id: allocationId, personId: actorId },
      });
      if (!allocation) throw new NotFoundException('Allocation not found.');
      await lockProjectWrites(tx, allocation.projectId);
      await assertProjectScope(tx, actorId, 'projects.allocate', allocation.projectId);
      if (allocation.minutes === 0) return allocationDto(allocation);
      const released = await tx.projectTimeAllocation.update({
        where: { id: allocationId },
        data: { minutes: 0 },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'PROJECT_ALLOCATION_RELEASED',
          entityType: 'ProjectTimeAllocation',
          entityId: allocationId,
          before: { minutes: allocation.minutes },
          after: { minutes: 0, bookingId: allocation.bookingId, projectId: allocation.projectId },
        },
        tx,
      );
      return allocationDto(released);
    });
  }

  async allocations(actorId: string, query: unknown) {
    const input = parseTimeQuery(query);
    await this.assertReadScope(actorId, input);
    const rows = await this.prisma.projectTimeAllocation.findMany({
      where: {
        personId: actorId,
        assignmentId: input.assignmentId,
        ...(input.projectId ? { projectId: input.projectId } : {}),
        booking: { startTime: bookingDateWhere(input) },
        ...cursorWhere('createdAt', input.cursor),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
      include: {
        project: { select: { code: true, name: true } },
        booking: { select: { startTime: true, endTime: true } },
      },
    });
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, allocationDto);
  }

  async unallocated(actorId: string, query: unknown) {
    const input = parseTimeQuery(query);
    await this.assertReadScope(actorId, input);
    const rows = await this.prisma.$queryRaw<AvailableBookingRow[]>(Prisma.sql`
      SELECT b.id, b."assignmentId", b."startTime", b."endTime",
        FLOOR(EXTRACT(EPOCH FROM (b."endTime" - b."startTime")) / 60)::integer AS "durationMinutes",
        COALESCE(SUM(a.minutes), 0)::integer AS "allocatedMinutes"
      FROM bookings b
      JOIN time_types t ON t.id = b."timeTypeId"
      LEFT JOIN project_time_allocations a ON a."bookingId" = b.id
      WHERE b."personId" = ${actorId} AND b."assignmentId" = ${input.assignmentId}
        AND b."endTime" IS NOT NULL AND b."endTime" <= CURRENT_TIMESTAMP
        AND t.category NOT IN ('PAUSE', 'ON_CALL')
        AND ${sqlDatePredicate(input)}
        AND ${membershipPredicate(input.projectId)}
        AND ${cursorSqlWhere('startTime', Prisma.sql`b."startTime"`, Prisma.sql`b.id`, input.cursor)}
      GROUP BY b.id, b."assignmentId", b."startTime", b."endTime"
      HAVING COALESCE(SUM(a.minutes), 0) < FLOOR(EXTRACT(EPOCH FROM (b."endTime" - b."startTime")) / 60)
      ORDER BY b."startTime" ASC, b.id ASC
      LIMIT ${input.limit + 1}
    `);
    return cursorPage(
      rows,
      input.limit,
      'startTime',
      (row) => row.startTime,
      (row) => ({
        bookingId: row.id,
        assignmentId: row.assignmentId,
        startTime: row.startTime.toISOString(),
        endTime: row.endTime.toISOString(),
        durationMinutes: Number(row.durationMinutes),
        allocatedMinutes: Number(row.allocatedMinutes),
        unallocatedMinutes: Number(row.durationMinutes) - Number(row.allocatedMinutes),
      }),
    );
  }
}
