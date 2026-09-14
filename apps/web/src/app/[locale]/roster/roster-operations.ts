import type { Dispatch, SetStateAction } from 'react';
import type { useTranslations } from 'next-intl';
import type { WorkspaceReadRequests } from '../../../shared/workspace/read-requests';
import type { ApiRequest } from '../../../platform/http/api-client';
import {
  PlanVsActualResponseSchema,
  RosterDetailSchema,
  RosterPublishResponseSchema,
  RosterShiftDetailSchema,
  RosterUnassignResponseSchema,
  ShiftAssignmentSchema,
  WorkflowInstanceSchema,
} from '@cueq/contracts';
import { localDateTimeInputToIsoInstant } from '../../../shared/time/datetime-local';
import type { PlanVsActual, RosterDetail } from './roster-types';

type TranslationFn = ReturnType<typeof useTranslations>;

export interface RosterOperationContext {
  apiRequest: ApiRequest;
  reads: WorkspaceReadRequests;
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
  const detail = await context.apiRequest(path, RosterDetailSchema);
  context.setRoster(detail);
  const plan = await context.apiRequest(
    `/v1/rosters/${detail.id}/plan-vs-actual`,
    PlanVsActualResponseSchema,
  );
  context.setPlanVsActual(plan);
  return detail;
}

async function runRosterOperation(
  context: RosterOperationContext,
  operation: (context: RosterOperationContext) => Promise<void>,
) {
  const read = context.reads.begin('roster');
  const guarded = { ...context, apiRequest: read.request };
  guarded.setRoster = (value) => {
    if (read.isCurrent()) context.setRoster(value);
  };
  guarded.setPlanVsActual = (value) => {
    if (read.isCurrent()) context.setPlanVsActual(value);
  };
  guarded.setMessage = (value) => {
    if (read.isCurrent()) context.setMessage(value);
  };
  guarded.setDraftOrganizationUnitId = (value) => {
    if (read.isCurrent()) context.setDraftOrganizationUnitId(value);
  };
  context.setLoading(true);
  context.setError(null);
  context.setMessage(null);
  try {
    await operation(guarded);
  } catch (cause) {
    if (!read.isCurrent()) return;
    context.setError(cause instanceof Error ? cause.message : context.t('requestFailed'));
  } finally {
    if (read.isCurrent()) {
      read.finish();
      context.setLoading(false);
    }
  }
}

export function loadCurrentRoster(context: RosterOperationContext) {
  return runRosterOperation(context, async (context) => {
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
  const periodStart = localDateTimeInputToIsoInstant(context.draftPeriodStart);
  const periodEnd = localDateTimeInputToIsoInstant(context.draftPeriodEnd);
  if (!periodStart || !periodEnd) {
    context.setError(context.t('invalidDateTime'));
    return Promise.resolve();
  }
  return runRosterOperation(context, async (context) => {
    const created = await context.apiRequest('/v1/rosters', RosterDetailSchema, {
      method: 'POST',
      body: JSON.stringify({
        organizationUnitId,
        periodStart,
        periodEnd,
      }),
    });
    await refreshRoster(context, created.id);
    context.setMessage(context.t('draftCreated'));
  });
}

export function createShift(context: RosterOperationContext) {
  if (!context.roster) return Promise.resolve();
  const startTime = localDateTimeInputToIsoInstant(context.shiftStart);
  const endTime = localDateTimeInputToIsoInstant(context.shiftEnd);
  if (!startTime || !endTime) {
    context.setError(context.t('invalidDateTime'));
    return Promise.resolve();
  }
  return runRosterOperation(context, async (context) => {
    await context.apiRequest(`/v1/rosters/${context.roster?.id}/shifts`, RosterShiftDetailSchema, {
      method: 'POST',
      body: JSON.stringify({
        startTime,
        endTime,
        shiftType: context.shiftType,
        minStaffing: context.minStaffing,
      }),
    });
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('shiftCreated'));
  });
}

export function assignShift(
  context: RosterOperationContext,
  shiftId: string,
  assignmentId: string,
) {
  const personId = context.assignSelection[shiftId] ?? context.roster?.members[0]?.id;
  if (!context.roster || !personId) return Promise.resolve();
  return runRosterOperation(context, async (context) => {
    await context.apiRequest(
      `/v1/rosters/${context.roster?.id}/shifts/${shiftId}/assignments`,
      ShiftAssignmentSchema,
      {
        method: 'POST',
        body: JSON.stringify({ personId, assignmentId }),
      },
    );
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('assignmentCreated'));
  });
}

export function unassignShift(
  context: RosterOperationContext,
  shiftId: string,
  shiftAssignmentId: string,
) {
  const record = context.roster?.shifts
    .find((shift) => shift.id === shiftId)
    ?.assignments.find((item) => item.id === shiftAssignmentId);
  if (!context.roster || !record) return Promise.resolve();
  return runRosterOperation(context, async (context) => {
    await context.apiRequest(
      `/v1/rosters/${context.roster?.id}/shifts/${shiftId}/assignments/${shiftAssignmentId}?assignmentId=${encodeURIComponent(record.assignmentId)}`,
      RosterUnassignResponseSchema,
      { method: 'DELETE' },
    );
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('assignmentRemoved'));
  });
}

export function publishRoster(context: RosterOperationContext) {
  if (!context.roster) return Promise.resolve();
  return runRosterOperation(context, async (context) => {
    await context.apiRequest(
      `/v1/rosters/${context.roster?.id}/publish`,
      RosterPublishResponseSchema,
      {
        method: 'POST',
      },
    );
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
  return runRosterOperation(context, async (context) => {
    await context.apiRequest('/v1/workflows/shift-swaps', WorkflowInstanceSchema, {
      method: 'POST',
      body: JSON.stringify({
        shiftId: context.swapShiftId,
        assignmentId: sourceAssignmentId(context),
        fromPersonId: context.swapFromPersonId,
        toPersonId: context.swapToPersonId,
        reason: context.swapReason,
      }),
    });
    await refreshRoster(context, context.roster?.id);
    context.setMessage(context.t('swapRequested'));
  });
}

function sourceAssignmentId(context: RosterOperationContext): string | undefined {
  const records =
    context.roster?.shifts
      .find((shift) => shift.id === context.swapShiftId)
      ?.assignments.filter((item) => item.personId === context.swapFromPersonId) ?? [];
  return records.length === 1 ? records[0]?.assignmentId : undefined;
}
