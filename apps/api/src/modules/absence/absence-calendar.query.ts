/** Resolves bounded, role-aware absence calendar queries without Nest dependencies. */
import { BadRequestException } from '@nestjs/common';
import { AbsenceStatus, Role } from '@cueq/database';
import { TeamCalendarQuerySchema } from '@cueq/contracts';

export function teamCalendarDateRange(
  start?: string,
  end?: string,
): { startDate: Date; endDate: Date } {
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

  return { startDate, endDate };
}

export function mayReadAbsenceDetails(role: Role): boolean {
  return role === Role.TEAM_LEAD || role === Role.HR;
}

export function teamCalendarStatuses(role: Role): AbsenceStatus[] {
  return mayReadAbsenceDetails(role)
    ? [AbsenceStatus.REQUESTED, AbsenceStatus.APPROVED]
    : [AbsenceStatus.APPROVED];
}

export function toTeamCalendarEntry(
  absence: {
    id: string;
    personId: string;
    type: string;
    startDate: Date;
    endDate: Date;
    status: AbsenceStatus;
    note: string | null;
    person: { firstName: string; lastName: string };
  },
  canReadAbsenceDetails: boolean,
) {
  return {
    id: absence.id,
    personId: absence.personId,
    personName: `${absence.person.firstName} ${absence.person.lastName}`,
    startDate: absence.startDate.toISOString().slice(0, 10),
    endDate: absence.endDate.toISOString().slice(0, 10),
    status: absence.status,
    visibilityStatus: 'ABSENT' as const,
    ...(canReadAbsenceDetails ? { type: absence.type, note: absence.note } : {}),
  };
}
