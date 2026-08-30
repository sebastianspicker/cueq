import { ClosingChecklistResponseSchema, ClosingPeriodSchema } from '@cueq/contracts';
import type { ApiRequest } from '../../../platform/http/api-client';
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

export function nextSelectedPeriodId(
  periods: ClosingPeriod[],
  selectedPeriodId: string | null,
): string | null {
  return periods.some((period) => period.id === selectedPeriodId)
    ? selectedPeriodId
    : (periods[0]?.id ?? null);
}

export function createPeriodSelection(
  selectedPeriodId: string,
  detail: ClosingPeriod,
  checklist: ClosingChecklistResponse,
): ClosingPeriodSelection {
  return { selectedPeriodId, detail, checklist };
}

export function clearPeriodSelection(): ClosingPeriodSelection {
  return { selectedPeriodId: null, detail: null, checklist: null };
}

export async function fetchPeriodSelection(apiRequest: ApiRequest, periodId: string) {
  return Promise.all([
    apiRequest(`/v1/closing-periods/${periodId}`, ClosingPeriodSchema),
    apiRequest(`/v1/closing-periods/${periodId}/checklist`, ClosingChecklistResponseSchema),
  ]);
}
