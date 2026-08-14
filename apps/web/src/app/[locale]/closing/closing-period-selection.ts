import { ClosingChecklistResponseSchema, ClosingPeriodSchema } from '@cueq/shared';
import type { ApiRequest } from '../../../lib/api-client';
import type { ClosingChecklistResponse, ClosingPeriod } from './closing-types';

export interface ClosingPeriodQuery {
  fromMonth: string;
  toMonth: string;
  organizationUnitId: string;
}

export interface ClosingPeriodSelection {
  selectedPeriodId: string | null;
  detail: ClosingPeriod | null;
  checklist: ClosingChecklistResponse | null;
}

/** Builds the closing-period list endpoint without including empty query values. */
export function closingPeriodsPath({
  fromMonth,
  toMonth,
  organizationUnitId,
}: ClosingPeriodQuery): string {
  const query = new URLSearchParams();
  if (fromMonth) query.set('from', fromMonth);
  if (toMonth) query.set('to', toMonth);
  if (organizationUnitId) query.set('organizationUnitId', organizationUnitId);
  return `/v1/closing-periods?${query.toString()}`;
}

/** Keeps the current selection when present, otherwise selects the first returned period. */
export function nextSelectedPeriodId(
  periods: ClosingPeriod[],
  selectedPeriodId: string | null,
): string | null {
  return periods.some((period) => period.id === selectedPeriodId)
    ? selectedPeriodId
    : (periods[0]?.id ?? null);
}

/** Represents a selected period after its detail and checklist have both refreshed. */
export function createPeriodSelection(
  selectedPeriodId: string,
  detail: ClosingPeriod,
  checklist: ClosingChecklistResponse,
): ClosingPeriodSelection {
  return { selectedPeriodId, detail, checklist };
}

/** Clears all detail that belongs to a previously selected period. */
export function clearPeriodSelection(): ClosingPeriodSelection {
  return { selectedPeriodId: null, detail: null, checklist: null };
}

/** Fetches the two detail resources together so displayed period state remains coherent. */
export async function fetchPeriodSelection(apiRequest: ApiRequest, periodId: string) {
  return Promise.all([
    apiRequest(`/v1/closing-periods/${periodId}`, ClosingPeriodSchema),
    apiRequest(`/v1/closing-periods/${periodId}/checklist`, ClosingChecklistResponseSchema),
  ]);
}
