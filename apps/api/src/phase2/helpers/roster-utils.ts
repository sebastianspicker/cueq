/**
 * Returns the union of person IDs assigned to a shift, merging the legacy
 * `shift.personId` field with the `shift.assignments` relation.
 */
export function assignedPersonIdsForShift(shift: {
  personId: string | null;
  assignments: Array<{ personId: string }>;
}): string[] {
  const assignmentIds = shift.assignments.map((assignment) => assignment.personId);
  if (shift.personId && !assignmentIds.includes(shift.personId)) {
    assignmentIds.push(shift.personId);
  }
  return assignmentIds;
}
