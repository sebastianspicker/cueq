/** Pure appointment interval and organization-unit eligibility checks for roster reads. */
import { EmploymentTermsError, resolveEmploymentTermsForInterval } from '@cueq/domain';

export type AppointmentEligibilityInput = {
  employmentStartDate: Date | null;
  employmentEndDate: Date | null;
  terms: Array<{
    id: string;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    organizationUnitId: string;
  }>;
};

function employmentCovers(appointment: AppointmentEligibilityInput, from: Date, to?: Date) {
  const employmentFrom = appointment.employmentStartDate?.getTime() ?? -Infinity;
  const employmentTo = appointment.employmentEndDate
    ? Date.parse(appointment.employmentEndDate.toISOString().slice(0, 10)) + 86_400_000
    : Infinity;
  return (
    employmentFrom <= from.getTime() &&
    from.getTime() < employmentTo &&
    (!to || to.getTime() <= employmentTo)
  );
}

/** Accepts adjacent term versions when every instant stays in the requested roster unit. */
export function appointmentCoversOrganizationUnit(
  appointment: AppointmentEligibilityInput,
  organizationUnitId: string,
  from: Date,
  to?: Date,
) {
  if (!employmentCovers(appointment, from, to)) return false;
  try {
    const selected = resolveEmploymentTermsForInterval(
      appointment.terms.map((term) => ({
        ...term,
        effectiveFrom: term.effectiveFrom?.toISOString() ?? null,
        effectiveTo: term.effectiveTo?.toISOString() ?? null,
      })),
      from.toISOString(),
      to?.toISOString(),
      (left, right) => left.organizationUnitId === right.organizationUnitId,
    );
    return selected.every((term) => term.organizationUnitId === organizationUnitId);
  } catch (error) {
    if (error instanceof EmploymentTermsError) return false;
    throw error;
  }
}
