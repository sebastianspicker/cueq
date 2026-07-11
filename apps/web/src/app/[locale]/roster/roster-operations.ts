import type { Dispatch, SetStateAction } from 'react';
import type { useTranslations } from 'next-intl';
import type { ApiRequest } from '../../../lib/api-client';
import type { PlanVsActual, RosterDetail } from './roster-sections';

type TranslationFn = ReturnType<typeof useTranslations>;

export interface RosterOperationContext {
  apiRequest: ApiRequest;
  t: TranslationFn;
  roster: RosterDetail | null;
  setRoster: Dispatch<SetStateAction<RosterDetail | null>>;
  setPlanVsActual: Dispatch<SetStateAction<PlanVsActual | null>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLoading: Dispatch<SetStateAction<boolean>>;
  draftOrganizationUnitId: string;
  setDraftOrganizationUnitId: Dispatch<SetStateAction<string>>;
  draftPeriodStart: string;
  draftPeriodEnd: string;
  shiftStart: string;
  shiftEnd: string;
  shiftType: string;
  minStaffing: number;
  assignSelection: Record<string, string>;
  swapShiftId: string;
  swapFromPersonId: string;
  swapToPersonId: string;
  swapReason: string;
}

async function refreshRoster(context: RosterOperationContext, targetRosterId?: string) {
  const path = targetRosterId ? `/v1/rosters/${targetRosterId}` : '/v1/rosters/current';
  const detail = await context.apiRequest<RosterDetail>(path);
  context.setRoster(detail);
  const plan = await context.apiRequest<PlanVsActual>(`/v1/rosters/${detail.id}/plan-vs-actual`);
  context.setPlanVsActual(plan);
  return detail;
}

async function runRosterOperation(context: RosterOperationContext, operation: () => Promise<void>) {
  context.setLoading(true);
  context.setError(null);
  context.setMessage(null);
  try {
    await operation();
  } catch (cause) {
    context.setError(cause instanceof Error ? cause.message : context.t('requestFailed'));
  } finally {
    context.setLoading(false);
  }
}

export function loadCurrentRoster(context: RosterOperationContext) {
  return runRosterOperation(context, async () => {
    const detail = await refreshRoster(context);
    if (!context.draftOrganizationUnitId) {
      context.setDraftOrganizationUnitId(detail.organizationUnitId);
    }
    context.setMessage(context.t('loaded'));
  });
}

export function createDraftRoster(context: RosterOperationContext) {
  const organizationUnitId = context.draftOrganizationUnitId || context.roster?.organizationUnitId;
  if (!organizationUnitId) {
    context.setError(context.t('missingOu'));
    return Promise.resolve();
  }
  return runRosterOperation(context, async () => {
    const created = await context.apiRequest<RosterDetail>('/v1/rosters', {
      method: 'POST',
      body: JSON.stringify({
        organizationUnitId,
        periodStart: new Date(context.draftPeriodStart).toISOString(),
        periodEnd: new Date(context.draftPeriodEnd).toISOString(),
      }),
    });
    await refreshRoster(context, created.id);
    context.setMessage(context.t('draftCreated'));
  });
}

export function createShift(context: RosterOperationContext) {
  if (!context.roster) return Promise.resolve();
  return runRosterOperation(context, async () => {
    await context.apiRequest(`/v1/rosters/${context.roster?.id}/shifts`, {
      method: 'POST',
      body: JSON.stringify({
        startTime: new Date(context.shiftStart).toISOString(),
        endTime: new Date(context.shiftEnd).toISOString(),
        shiftType: context.shiftType,
        minStaffing: context.minStaffing,
      }),
    });
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('shiftCreated'));
  });
}

export function assignShift(context: RosterOperationContext, shiftId: string) {
  const personId = context.assignSelection[shiftId] ?? context.roster?.members[0]?.id;
  if (!context.roster || !personId) return Promise.resolve();
  return runRosterOperation(context, async () => {
    await context.apiRequest(`/v1/rosters/${context.roster?.id}/shifts/${shiftId}/assignments`, {
      method: 'POST',
      body: JSON.stringify({ personId }),
    });
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('assignmentCreated'));
  });
}

export function unassignShift(
  context: RosterOperationContext,
  shiftId: string,
  assignmentId: string,
) {
  if (!context.roster) return Promise.resolve();
  return runRosterOperation(context, async () => {
    await context.apiRequest(
      `/v1/rosters/${context.roster?.id}/shifts/${shiftId}/assignments/${assignmentId}`,
      { method: 'DELETE' },
    );
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('assignmentRemoved'));
  });
}

export function publishRoster(context: RosterOperationContext) {
  if (!context.roster) return Promise.resolve();
  return runRosterOperation(context, async () => {
    await context.apiRequest(`/v1/rosters/${context.roster?.id}/publish`, { method: 'POST' });
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('published'));
  });
}

export function requestShiftSwap(context: RosterOperationContext) {
  const complete =
    context.roster && context.swapShiftId && context.swapFromPersonId && context.swapToPersonId;
  if (!complete) {
    context.setError(context.t('swapMissingFields'));
    return Promise.resolve();
  }
  return runRosterOperation(context, async () => {
    await context.apiRequest('/v1/workflows/shift-swaps', {
      method: 'POST',
      body: JSON.stringify({
        shiftId: context.swapShiftId,
        fromPersonId: context.swapFromPersonId,
        toPersonId: context.swapToPersonId,
        reason: context.swapReason,
      }),
    });
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('swapRequested'));
  });
}
