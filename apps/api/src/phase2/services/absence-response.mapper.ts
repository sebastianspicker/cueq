/** Maps persisted absences to the stable API response contract. */
import type { Absence } from '@cueq/database';
import type { Absence as AbsenceResponse } from '@cueq/shared';

export function toAbsenceResponse(absence: Absence): AbsenceResponse {
  return {
    id: absence.id,
    personId: absence.personId,
    type: absence.type,
    startDate: absence.startDate.toISOString().slice(0, 10),
    endDate: absence.endDate.toISOString().slice(0, 10),
    days: absence.days.toNumber(),
    status: absence.status,
    note: absence.note,
    createdAt: absence.createdAt.toISOString(),
    updatedAt: absence.updatedAt.toISOString(),
  };
}
