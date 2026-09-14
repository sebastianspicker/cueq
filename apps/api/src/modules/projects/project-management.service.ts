/** Project administration preserves hierarchy, archived history, and effective memberships. */
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateProjectMembershipSchema,
  CreateProjectSchema,
  CursorQuerySchema,
} from '@cueq/contracts';
import { PrismaService } from '../../persistence/prisma.service.js';
import { cursorPage, cursorWhere } from '../../persistence/queries/cursor-page.js';
import { parseRequest } from '../../platform/http/validation/zod-validation.pipe.js';
import {
  lockPersonWrites,
  lockProjectWrites,
} from '../../platform/transactions/transaction-lock.helper.js';
import { AuditHelper } from '../audit/public.js';
import { AssignmentHelper, CapabilityHelper, assertPersonnelScope } from '../people/public.js';
import { membershipDto, projectDto } from './project-dto.js';
import { assertProjectScope } from './project-scope.js';

function assignmentCoversMembership(
  assignment: { employmentStartDate: Date | null; employmentEndDate: Date | null },
  from: Date,
  to: Date | null,
) {
  const employmentFrom = assignment.employmentStartDate?.getTime() ?? -Infinity;
  const employmentTo = assignment.employmentEndDate
    ? Date.parse(assignment.employmentEndDate.toISOString().slice(0, 10)) + 86_400_000
    : Infinity;
  return (
    employmentFrom <= from.getTime() &&
    from.getTime() < employmentTo &&
    (to ? to.getTime() <= employmentTo : employmentTo === Infinity)
  );
}

@Injectable()
export class ProjectManagementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CapabilityHelper) private readonly capabilities: CapabilityHelper,
    @Inject(AssignmentHelper) private readonly assignments: AssignmentHelper,
    @Inject(AuditHelper) private readonly audit: AuditHelper,
  ) {}

  async create(actorId: string, payload: unknown) {
    const input = parseRequest(CreateProjectSchema, payload);
    return this.prisma.$transaction(async (tx) => {
      await this.capabilities.assert(
        actorId,
        'projects.manage',
        { organizationUnitId: input.organizationUnitId },
        tx,
      );
      await assertPersonnelScope(tx, actorId, 'personnel.read', input.managerId);
      if (input.parentId) {
        await lockProjectWrites(tx, input.parentId);
        await assertProjectScope(tx, actorId, 'projects.manage', input.parentId);
        const parent = await tx.project.findUnique({ where: { id: input.parentId } });
        if (!parent) throw new NotFoundException('Parent project not found.');
        if (parent.archivedAt) {
          throw new ConflictException('An archived project cannot receive subprojects.');
        }
      }
      const organization = await tx.organizationUnit.findUnique({
        where: { id: input.organizationUnitId },
        select: { id: true },
      });
      if (!organization) throw new BadRequestException('Organization not found.');
      const project = await tx.project.create({ data: input });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'PROJECT_CREATED',
          entityType: 'Project',
          entityId: project.id,
          after: { code: project.code, parentId: project.parentId },
        },
        tx,
      );
      return projectDto(project);
    });
  }

  async archive(actorId: string, projectId: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockProjectWrites(tx, projectId);
      await assertProjectScope(tx, actorId, 'projects.manage', projectId);
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Project not found.');
      if (project.archivedAt) {
        return { id: project.id, archivedAt: project.archivedAt.toISOString() };
      }
      const archivedAt = new Date();
      await tx.project.update({ where: { id: projectId }, data: { archivedAt } });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'PROJECT_ARCHIVED',
          entityType: 'Project',
          entityId: projectId,
          after: { archivedAt: archivedAt.toISOString() },
        },
        tx,
      );
      return { id: projectId, archivedAt: archivedAt.toISOString() };
    });
  }

  async addMember(actorId: string, projectId: string, payload: unknown) {
    const input = parseRequest(CreateProjectMembershipSchema, payload);
    const effectiveFrom = new Date(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? new Date(input.effectiveTo) : null;
    return this.prisma.$transaction(async (tx) => {
      await lockPersonWrites(tx, [input.personId]);
      await lockProjectWrites(tx, projectId);
      await assertProjectScope(tx, actorId, 'projects.manage', projectId);
      await assertPersonnelScope(tx, actorId, 'personnel.read', input.personId);
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Project not found.');
      if (project.archivedAt) {
        throw new ConflictException('Archived projects cannot receive memberships.');
      }
      const assignment = await this.assignments.selectAssignment(
        input.personId,
        input.assignmentId,
        tx,
        effectiveFrom,
      );
      if (!assignmentCoversMembership(assignment, effectiveFrom, effectiveTo)) {
        throw new BadRequestException('Membership exceeds appointment dates.');
      }
      const overlap = await tx.projectMembership.findFirst({
        where: {
          projectId,
          assignmentId: assignment.id,
          AND: [
            { OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }] },
            ...(effectiveTo ? [{ effectiveFrom: { lt: effectiveTo } }] : []),
          ],
        },
        select: { id: true },
      });
      if (overlap) {
        throw new ConflictException('Membership already covers part of this interval.');
      }
      const membership = await tx.projectMembership.create({
        data: {
          projectId,
          personId: input.personId,
          assignmentId: assignment.id,
          effectiveFrom,
          effectiveTo,
        },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'PROJECT_MEMBERSHIP_CREATED',
          entityType: 'ProjectMembership',
          entityId: membership.id,
          after: {
            projectId,
            personId: input.personId,
            assignmentId: assignment.id,
            effectiveFrom: input.effectiveFrom,
            effectiveTo: input.effectiveTo,
          },
        },
        tx,
      );
      return membershipDto(membership);
    });
  }

  async members(actorId: string, projectId: string, query: unknown) {
    await assertProjectScope(this.prisma, actorId, 'projects.read', projectId);
    const input = parseRequest(CursorQuerySchema, query);
    const rows = await this.prisma.projectMembership.findMany({
      where: { projectId, ...cursorWhere('createdAt', input.cursor) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: input.limit + 1,
    });
    return cursorPage(rows, input.limit, 'createdAt', (row) => row.createdAt, membershipDto);
  }

  async endMembership(actorId: string, projectId: string, membershipId: string) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.projectMembership.findUnique({
        where: { id: membershipId },
        select: { personId: true, projectId: true },
      });
      if (!initial || initial.projectId !== projectId) {
        throw new NotFoundException('Membership not found.');
      }
      await lockPersonWrites(tx, [initial.personId]);
      await lockProjectWrites(tx, projectId);
      await assertProjectScope(tx, actorId, 'projects.manage', projectId);
      const membership = await tx.projectMembership.findUnique({ where: { id: membershipId } });
      if (!membership || membership.projectId !== projectId) {
        throw new NotFoundException('Membership not found.');
      }
      const now = new Date();
      if (membership.effectiveTo && membership.effectiveTo <= now) {
        return membershipDto(membership);
      }
      if (membership.effectiveFrom >= now) {
        throw new ConflictException('Future membership cannot be ended before it starts.');
      }
      const ended = await tx.projectMembership.update({
        where: { id: membershipId },
        data: { effectiveTo: now },
      });
      await this.audit.appendAudit(
        {
          actorId,
          action: 'PROJECT_MEMBERSHIP_ENDED',
          entityType: 'ProjectMembership',
          entityId: membershipId,
          before: { effectiveTo: membership.effectiveTo?.toISOString() ?? null },
          after: { effectiveTo: now.toISOString() },
        },
        tx,
      );
      return membershipDto(ended);
    });
  }
}
