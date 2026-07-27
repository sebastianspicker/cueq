/** Defines Phase 2 role sets and reusable person-scope authorization guards. */
import { ForbiddenException } from '@nestjs/common';
import { AbsenceType, Role } from '@cueq/database';
import type { AuthenticatedIdentity } from '../../common/auth/auth.types.js';

/* ── Role Sets ─────────────────────────────────────────────── */

/** Roles allowed to perform privileged cross-person HR operations. */
export const HR_LIKE_ROLES = new Set<Role>([Role.HR, Role.ADMIN]);

/** Roles eligible for approval work before workflow-type checks narrow the set. */
export const APPROVAL_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.SHIFT_PLANNER,
  Role.HR,
  Role.ADMIN,
]);

/** Roles allowed to read monthly-closing workspaces. */
export const CLOSING_READ_ROLES = new Set<Role>([Role.TEAM_LEAD, Role.HR, Role.ADMIN]);

/** Roles allowed to download persisted payroll export artifacts. */
export const EXPORT_DOWNLOAD_ROLES = new Set<Role>([Role.HR, Role.ADMIN, Role.PAYROLL]);

/** Roles allowed to request operational aggregate reports. */
export const REPORT_ALLOWED_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.HR,
  Role.ADMIN,
  Role.DATA_PROTECTION,
  Role.WORKS_COUNCIL,
]);

/** Roles allowed to request audit and compliance summaries. */
export const SENSITIVE_REPORT_ALLOWED_ROLES = new Set<Role>([
  Role.HR,
  Role.ADMIN,
  Role.DATA_PROTECTION,
  Role.WORKS_COUNCIL,
]);

/** Roles allowed to invoke working-time rule evaluations. */
export const TIME_ENGINE_ALLOWED_ROLES = new Set<Role>([
  Role.TEAM_LEAD,
  Role.SHIFT_PLANNER,
  Role.HR,
  Role.ADMIN,
]);

/* ── Absence Type Sets ─────────────────────────────────────── */

/** Absence types that enter an approval workflow. */
export const ABSENCE_TYPES_WITH_APPROVAL = new Set<AbsenceType>([
  AbsenceType.ANNUAL_LEAVE,
  AbsenceType.SPECIAL_LEAVE,
  AbsenceType.TRAINING,
  AbsenceType.TRAVEL,
  AbsenceType.COMP_TIME,
  AbsenceType.FLEX_DAY,
  AbsenceType.UNPAID,
]);

/** Absence types accepted without a separate approval workflow. */
export const ABSENCE_TYPES_AUTO_APPROVED = new Set<AbsenceType>([
  AbsenceType.SICK,
  AbsenceType.PARENTAL,
]);

/* ── Shared Assertions ─────────────────────────────────────── */

/** Restricts an operation to the roles allowed to act across employment records. */
export function assertHrLikeRole(user: AuthenticatedIdentity): void {
  if (!HR_LIKE_ROLES.has(user.role)) {
    throw new ForbiddenException('This action is restricted to HR/Admin roles.');
  }
}

/** Allows self-service actions while requiring HR/Admin authority for another person. */
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
