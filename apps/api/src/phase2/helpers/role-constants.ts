import { ForbiddenException } from '@nestjs/common';
import { AbsenceType, Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types';

/* ── Role Sets ─────────────────────────────────────────────── */

export const HR_LIKE_ROLES = new Set<Role>([Role.HR, Role.ADMIN]);

export const APPROVAL_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.SHIFT_PLANNER,
  Role.HR,
  Role.ADMIN,
]);

export const CLOSING_READ_ROLES = new Set<Role>([Role.TEAM_LEAD, Role.HR, Role.ADMIN]);

export const EXPORT_DOWNLOAD_ROLES = new Set<Role>([Role.HR, Role.ADMIN, Role.PAYROLL]);

export const REPORT_ALLOWED_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.HR,
  Role.ADMIN,
  Role.DATA_PROTECTION,
  Role.WORKS_COUNCIL,
]);

export const SENSITIVE_REPORT_ALLOWED_ROLES = new Set<Role>([
  Role.HR,
  Role.ADMIN,
  Role.DATA_PROTECTION,
  Role.WORKS_COUNCIL,
]);

export const TIME_ENGINE_ALLOWED_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.SHIFT_PLANNER,
  Role.HR,
  Role.ADMIN,
]);

/* ── Absence Type Sets ─────────────────────────────────────── */

export const ABSENCE_TYPES_WITH_APPROVAL = new Set<AbsenceType>([
  AbsenceType.ANNUAL_LEAVE,
  AbsenceType.SPECIAL_LEAVE,
  AbsenceType.TRAINING,
  AbsenceType.TRAVEL,
  AbsenceType.COMP_TIME,
  AbsenceType.FLEX_DAY,
  AbsenceType.UNPAID,
]);

export const ABSENCE_TYPES_AUTO_APPROVED = new Set<AbsenceType>([
  AbsenceType.SICK,
  AbsenceType.PARENTAL,
]);

/* ── Shared Assertions ─────────────────────────────────────── */

export function assertHrLikeRole(user: AuthenticatedIdentity): void {
  if (!HR_LIKE_ROLES.has(user.role)) {
    throw new ForbiddenException('This action is restricted to HR/Admin roles.');
  }
}

export function assertCanActForPerson(
  user: AuthenticatedIdentity,
  actorPersonId: string,
  targetPersonId: string,
): void {
  if (targetPersonId === actorPersonId) {
    return;
  }

  if (!HR_LIKE_ROLES.has(user.role)) {
    throw new ForbiddenException('Cross-person action is restricted to HR/Admin roles.');
  }
}
