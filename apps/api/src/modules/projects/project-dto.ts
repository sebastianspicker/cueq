/** Maps project persistence records to the shared HTTP response shapes. */

type DecimalValue = { toNumber(): number } | number | null;

export type ProjectRecord = {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  organizationUnitId: string;
  managerId: string;
  costCentre: string | null;
  fundingReference: string | null;
  budgetHours: DecimalValue;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function decimalNumber(value: DecimalValue): number | null {
  if (value === null) return null;
  return typeof value === 'number' ? value : value.toNumber();
}

export function projectDto(project: ProjectRecord) {
  return {
    id: project.id,
    code: project.code,
    name: project.name,
    parentId: project.parentId,
    organizationUnitId: project.organizationUnitId,
    managerId: project.managerId,
    costCentre: project.costCentre,
    fundingReference: project.fundingReference,
    budgetHours: decimalNumber(project.budgetHours),
    archivedAt: project.archivedAt?.toISOString() ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function membershipDto(membership: {
  id: string;
  projectId: string;
  personId: string;
  assignmentId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
}) {
  return {
    id: membership.id,
    projectId: membership.projectId,
    personId: membership.personId,
    assignmentId: membership.assignmentId,
    effectiveFrom: membership.effectiveFrom.toISOString(),
    effectiveTo: membership.effectiveTo?.toISOString() ?? null,
    createdAt: membership.createdAt.toISOString(),
  };
}

export function allocationDto(allocation: {
  id: string;
  projectId: string;
  bookingId: string;
  assignmentId: string;
  personId: string;
  minutes: number;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  project?: { code: string; name: string };
  booking?: { startTime: Date; endTime: Date | null };
}) {
  return {
    id: allocation.id,
    projectId: allocation.projectId,
    projectCode: allocation.project?.code,
    projectName: allocation.project?.name,
    bookingId: allocation.bookingId,
    assignmentId: allocation.assignmentId,
    personId: allocation.personId,
    minutes: allocation.minutes,
    note: allocation.note,
    bookingStartTime: allocation.booking?.startTime.toISOString(),
    bookingEndTime: allocation.booking?.endTime?.toISOString() ?? null,
    createdAt: allocation.createdAt.toISOString(),
    updatedAt: allocation.updatedAt.toISOString(),
  };
}
