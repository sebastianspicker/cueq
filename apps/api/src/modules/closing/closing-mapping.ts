/** Maps database closing values into core states and stable API responses. */
import { ClosingStatus, Role } from '@cueq/database';
import { toCoreClosingStatus } from '../../platform/transactions/closing-lock.helper.js';

/** Least-privilege role vocabulary understood by the pure closing state machine. */
export type ClosingActorRole = 'EMPLOYEE' | 'TEAM_LEAD' | 'HR' | 'ADMIN';
/** Business-facing closing states, including the database `CLOSED` to `APPROVED` mapping. */
export type CoreClosingStatus = 'OPEN' | 'REVIEW' | 'APPROVED' | 'EXPORTED';

/** Maps a database role to the least-privilege closing actor role. */
export function toClosingActorRole(role: Role): ClosingActorRole {
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

/** Converts the core closing state to its persistence representation. */
export function toPersistenceClosingStatus(status: CoreClosingStatus): ClosingStatus {
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

/** Serializes a persisted closing period into the stable API response shape. */
export function mapClosingPeriodResponse(period: {
  id: string;
  organizationUnitId: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: ClosingStatus;
  exportRuns: unknown;
  closedAt: Date | null;
  closedById: string | null;
  leadApprovedAt: Date | null;
  leadApprovedById: string | null;
  hrApprovedAt: Date | null;
  hrApprovedById: string | null;
  lockedAt: Date | null;
  lockSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
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
