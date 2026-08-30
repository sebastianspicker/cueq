/** Normalizes persisted workflow JSON values before they drive routing or audit behavior. */
import type { Prisma } from '@cueq/database';
import { Role } from '@cueq/database';

/** Normalizes stored JSON role arrays while dropping unknown or malformed values. */
export function asRoleArray(value: Prisma.JsonValue | null | undefined): Role[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((candidate): candidate is Role => {
    return typeof candidate === 'string' && Object.values(Role).includes(candidate as Role);
  });
}

/** Appends an approver once while normalizing a persisted delegation trail. */
export function appendTrail(trail: Prisma.JsonValue | null, approverId?: string | null): string[] {
  const normalized = Array.isArray(trail)
    ? trail.filter((value): value is string => typeof value === 'string')
    : [];
  if (approverId && !normalized.includes(approverId)) {
    normalized.push(approverId);
  }
  return normalized;
}
